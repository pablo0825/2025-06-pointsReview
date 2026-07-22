import path from "node:path";
import { randomUUID } from "node:crypto";

import { env } from "../config/env";
import { pool } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ApiError } from "../errors/apiError";
import type { ValidatedSignature } from "../files/fileValidator";
import {
  LocalPrivateFileStorage,
  type PrivateFileStorage,
} from "../files/privateFileStorage";
import {
  toAdvisorApplicationDetail,
  toAdvisorApplicationListItem,
  toAdvisorReviewAction,
  toAdvisorSignature,
  toAdvisorVersion,
} from "../mappers/advisorApplication.mapper";
import { AdvisorApplicationRepository } from "../repositories/advisorApplication.repository";
import type {
  AdvisorApproveBody,
  AdvisorHistoryListQuery,
  AdvisorPendingListQuery,
  AdvisorRejectBody,
} from "../schemas/advisorApplication.schema";
import { EmailTaskService } from "./emailTask.service";

let defaultStorage: PrivateFileStorage | undefined;

function getDefaultStorage(): PrivateFileStorage {
  if (defaultStorage) return defaultStorage;
  const root =
    process.env.PRIVATE_FILE_STORAGE_ROOT ??
    env.privateFileStorageRoot ??
    (env.nodeEnv === "production"
      ? undefined
      : path.resolve("storage/private-files"));
  if (!root) {
    throw new Error("PRIVATE_FILE_STORAGE_ROOT is required in production");
  }
  defaultStorage = new LocalPrivateFileStorage(root);
  return defaultStorage;
}

export interface AdvisorActionContext {
  userId: string;
  ipAddress: string;
  userAgent: string;
}

function notFound(): ApiError {
  return new ApiError(404, "not_found", "找不到申請資料。");
}

export async function listPending(
  userId: string,
  input: AdvisorPendingListQuery,
) {
  const result = await AdvisorApplicationRepository.listPending(
    pool,
    userId,
    input,
  );
  return {
    items: result.items.map(toAdvisorApplicationListItem),
    totalItems: result.totalItems,
  };
}

export async function listHistory(
  userId: string,
  input: AdvisorHistoryListQuery,
) {
  const result = await AdvisorApplicationRepository.listHistory(
    pool,
    userId,
    input,
  );
  return {
    items: result.items.map(toAdvisorApplicationListItem),
    totalItems: result.totalItems,
  };
}

async function getBaseDetail(
  userId: string,
  publicId: string,
  scope: "pending" | "history",
) {
  const application = await AdvisorApplicationRepository.findDetail(
    pool,
    userId,
    publicId,
    scope,
  );
  if (!application) throw notFound();
  const [participants, attachments] = await Promise.all([
    AdvisorApplicationRepository.listParticipants(pool, application.id),
    AdvisorApplicationRepository.listAttachments(
      pool,
      application.id,
      application.current_version_id,
    ),
  ]);
  return {
    application,
    response: toAdvisorApplicationDetail(
      application,
      participants,
      attachments,
    ),
  };
}

export async function getPendingDetail(userId: string, publicId: string) {
  return (await getBaseDetail(userId, publicId, "pending")).response;
}

export async function getHistoryDetail(userId: string, publicId: string) {
  const { application, response } = await getBaseDetail(
    userId,
    publicId,
    "history",
  );
  const [versions, attachments, reviewActions, signatures] = await Promise.all([
    AdvisorApplicationRepository.listVersions(pool, application.id),
    AdvisorApplicationRepository.listAttachments(pool, application.id),
    AdvisorApplicationRepository.listAdvisorReviewActions(pool, application.id),
    AdvisorApplicationRepository.listAdvisorSignatures(pool, application.id),
  ]);
  return {
    ...response,
    versions: versions.map((version) => toAdvisorVersion(version, attachments)),
    advisorReviewActions: reviewActions.map(toAdvisorReviewAction),
    advisorSignatures: signatures.map(toAdvisorSignature),
  };
}

function validateActionApplication(
  application: Awaited<
    ReturnType<typeof AdvisorApplicationRepository.findForAdvisorAction>
  >,
  context: AdvisorActionContext,
) {
  if (!application || application.advisor_user_id !== context.userId) {
    throw notFound();
  }
  if (application.status !== "pending_advisor") {
    throw new ApiError(
      409,
      "application_status_conflict",
      "申請目前狀態無法進行老師簽核。",
    );
  }
  if (application.advisor_confirmation_expires_at <= new Date()) {
    throw new ApiError(
      409,
      "advisor_confirmation_expired",
      "指導老師簽核期限已過。",
    );
  }
  return application;
}

export async function approve(
  publicId: string,
  input: AdvisorApproveBody,
  signature: ValidatedSignature,
  context: AdvisorActionContext,
  storage: PrivateFileStorage = getDefaultStorage(),
) {
  let storedKey: string | undefined;
  try {
    return await withTransaction(async (client) => {
      const application = validateActionApplication(
        await AdvisorApplicationRepository.findForAdvisorAction(
          client,
          publicId,
        ),
        context,
      );
      if (application.current_version_number !== input.confirmVersionNumber) {
        throw new ApiError(
          409,
          "application_version_conflict",
          "申請版本已更新，請重新確認內容。",
        );
      }
      if (
        await AdvisorApplicationRepository.hasValidSignature(
          client,
          application.current_version_id,
        )
      ) {
        throw new ApiError(
          409,
          "application_status_conflict",
          "目前版本已完成簽名。",
        );
      }
      const signedAt = new Date();
      storedKey = `signatures/${application.public_id}/version-${application.current_version_number}/${randomUUID()}.png`;
      await storage.saveFromPath(storedKey, signature.temporaryPath);
      await AdvisorApplicationRepository.createSignature(client, {
        versionId: application.current_version_id,
        advisorUserId: context.userId,
        storageKey: storedKey,
        signedAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      await AdvisorApplicationRepository.createReviewAction(client, {
        applicationId: application.id,
        advisorUserId: context.userId,
        actionType: "advisor_approved",
        versionNumber: application.current_version_number,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      await AdvisorApplicationRepository.markUnderReview(
        client,
        application.id,
      );
      await EmailTaskService.cancelPendingAdvisorNotifications(
        client,
        application.id,
        application.current_version_number,
      );
      return { status: "under_review" as const, signedAt };
    });
  } catch (error) {
    if (storedKey) await storage.remove(storedKey).catch(() => undefined);
    throw error;
  }
}

export async function reject(
  publicId: string,
  input: AdvisorRejectBody,
  context: AdvisorActionContext,
) {
  return withTransaction(async (client) => {
    const application = validateActionApplication(
      await AdvisorApplicationRepository.findForAdvisorAction(client, publicId),
      context,
    );
    const closedAt = new Date();
    await AdvisorApplicationRepository.createReviewAction(client, {
      applicationId: application.id,
      advisorUserId: context.userId,
      actionType: "advisor_rejected",
      reason: input.reason,
      versionNumber: application.current_version_number,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    await AdvisorApplicationRepository.markRejected(
      client,
      application.id,
      closedAt,
    );
    await EmailTaskService.cancelPendingAdvisorNotifications(
      client,
      application.id,
      application.current_version_number,
    );
    await EmailTaskService.createPendingTask(client, {
      eventKey: `application-rejected:application-${application.id}:version-${application.current_version_number}:advisor`,
      applicationId: application.id,
      recipientEmail: application.applicant_email,
      templateName: "application_rejected",
      payload: {
        applicantDisplayName: application.applicant_name,
        applicationPublicId: application.public_id,
        applicationType: application.application_type,
        rejectionReason: input.reason,
      },
      scheduledAt: closedAt,
    });
    return { status: "rejected" as const, closedAt };
  });
}

export const AdvisorApplicationService = {
  listPending,
  listHistory,
  getPendingDetail,
  getHistoryDetail,
  approve,
  reject,
};
