import path from "node:path";
import { randomUUID } from "node:crypto";

import { env } from "../config/env";
import { withTransaction } from "../db/transaction";
import {
  calculateCertificatePoints,
  calculateCompetitionPoints,
  calculateExhibitionPoints,
  calculateProjectPoints,
  PointCalculationError,
} from "../domain/pointCalculator";
import { ApiError } from "../errors/apiError";
import { FileValidator, type ValidatedUpload } from "../files/fileValidator";
import {
  LocalPrivateFileStorage,
  type PrivateFileStorage,
} from "../files/privateFileStorage";
import { ApplicationSubmissionRepository } from "../repositories/applicationSubmission.repository";
import { ParticipantRuleRepository } from "../repositories/participantRule.repository";
import {
  PointRuleRepository,
  type PointRuleRow,
} from "../repositories/pointRule.repository";
import type { CreateApplicationSubmission } from "../schemas/applicationSubmission.schema";
import { EmailTaskService } from "./emailTask.service";

const reminderHours = [72, 24, 4] as const;
let defaultStorage: PrivateFileStorage | undefined;

function validationError(path: string, message: string): ApiError {
  return new ApiError(422, "validation_failed", "送件資料不符合規則。", [
    { path, message },
  ]);
}

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

function requireRuleValue(row: PointRuleRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Point rule ${key} is missing`);
  }
  return value;
}

async function validateFiles(
  input: CreateApplicationSubmission,
  files: Map<string, Express.Multer.File>,
): Promise<Map<string, ValidatedUpload>> {
  if (files.size !== input.attachments.length) {
    throw validationError(
      "attachments",
      "每個附件 metadata 必須剛好對應一個檔案。",
    );
  }
  const validated = new Map<string, ValidatedUpload>();
  for (const metadata of input.attachments) {
    const file = files.get(metadata.clientFileKey);
    if (!file) {
      throw validationError(
        `attachments.${metadata.clientFileKey}`,
        "找不到附件對應檔案。",
      );
    }
    validated.set(
      metadata.clientFileKey,
      await FileValidator.validateUpload(file, metadata.clientFileKey),
    );
  }
  return validated;
}

function validateRequiredAttachments(input: CreateApplicationSubmission) {
  const types = new Set(input.attachments.map((item) => item.attachmentType));
  const valid =
    input.applicationType === "competition"
      ? types.has("participation_proof") ||
        types.has("finalist_or_award_certificate")
      : input.applicationType === "project_participation"
        ? types.has("salary_proof")
        : input.applicationType === "certificate"
          ? types.has("certificate_copy")
          : types.has("exhibition_photo");
  if (!valid) {
    throw validationError("attachments", "缺少此申請類型要求的必要附件。");
  }
}

function validateApplicant(input: CreateApplicationSubmission) {
  const applicants = input.participants.filter(
    (participant) => participant.isApplicant,
  );
  if (
    applicants.length !== 1 ||
    applicants[0].studentName !== input.applicant.name
  ) {
    throw validationError(
      "participants",
      "參與者中必須有且只有一位姓名相符的申請人。",
    );
  }
}

function validateParticipantRule(
  count: number,
  rule: { minimum_participants: number; maximum_participants: number },
) {
  if (count < rule.minimum_participants || count > rule.maximum_participants) {
    throw validationError(
      "participants",
      `參與人數必須介於 ${rule.minimum_participants} 至 ${rule.maximum_participants} 人。`,
    );
  }
}

function calculateSalary(
  input: Extract<
    CreateApplicationSubmission,
    {
      applicationType: "project_participation";
    }
  >,
): number {
  const total = input.typeDetails.salaryItems.reduce(
    (sum, item) => sum + item.salaryAmount,
    0,
  );
  if (!Number.isSafeInteger(total)) {
    throw validationError("typeDetails.salaryItems", "薪資總額超過允許範圍。");
  }
  return total;
}

async function createAdvisorEmailTasks(
  client: Parameters<typeof EmailTaskService.createPendingTask>[0],
  input: CreateApplicationSubmission,
  application: { id: string; public_id: string },
  advisor: { name: string; email: string },
  submittedAt: Date,
  expiresAt: Date,
) {
  const payload = {
    advisorDisplayName: advisor.name,
    applicationPublicId: application.public_id,
    applicationType: input.applicationType,
    advisorConfirmationExpiresAt: expiresAt.toISOString(),
    advisorReviewUrl: `${env.frontendUrl}/advisor/applications/pending/${application.public_id}`,
  };
  await EmailTaskService.createPendingTask(client, {
    eventKey: `advisor-sign-request:application-${application.id}:version-1`,
    applicationId: application.id,
    recipientEmail: advisor.email,
    templateName: "advisor_sign_request",
    payload,
    scheduledAt: submittedAt,
  });
  for (const [index, hours] of reminderHours.entries()) {
    const scheduledAt = new Date(expiresAt.getTime() - hours * 60 * 60 * 1000);
    if (scheduledAt <= submittedAt) continue;
    await EmailTaskService.createPendingTask(client, {
      eventKey: `advisor-sign-reminder-${index + 1}:application-${application.id}:version-1`,
      applicationId: application.id,
      recipientEmail: advisor.email,
      templateName: `advisor_sign_reminder_${index + 1}` as
        | "advisor_sign_reminder_1"
        | "advisor_sign_reminder_2"
        | "advisor_sign_reminder_3",
      payload,
      scheduledAt,
    });
  }
}

export async function submitApplication(
  input: CreateApplicationSubmission,
  files: Map<string, Express.Multer.File>,
  storage: PrivateFileStorage = getDefaultStorage(),
) {
  validateApplicant(input);
  validateRequiredAttachments(input);
  const uploads = await validateFiles(input, files);
  const submittedAt = new Date();
  if (env.advisorConfirmationTtlHours <= 0) {
    throw new Error("ADVISOR_CONFIRMATION_TTL_HOURS must be positive");
  }
  const expiresAt = new Date(
    submittedAt.getTime() + env.advisorConfirmationTtlHours * 60 * 60 * 1000,
  );
  const storedKeys: string[] = [];

  try {
    return await withTransaction(async (client) => {
      const advisor =
        await ApplicationSubmissionRepository.findAvailableAdvisor(
          client,
          input.advisorId,
        );
      if (!advisor) {
        throw validationError("advisorId", "指導老師不存在或目前不可選擇。");
      }
      const participantRule = await ParticipantRuleRepository.findEffective(
        client,
        input.applicationType,
        submittedAt,
      );
      if (!participantRule) {
        throw validationError(
          "applicationType",
          "目前沒有有效的申請人數規則。",
        );
      }
      validateParticipantRule(input.participants.length, participantRule);

      const ruleKey =
        input.applicationType === "competition"
          ? {
              competitionLevel: input.typeDetails.competitionLevel,
              award: input.typeDetails.award,
            }
          : input.applicationType === "external_exhibition"
            ? { exhibitionType: input.typeDetails.exhibitionType }
            : {};
      const pointRule = await PointRuleRepository.findEffective(
        client,
        input.applicationType,
        submittedAt,
        ruleKey,
      );
      if (!pointRule) {
        throw validationError(
          "typeDetails",
          "目前沒有符合條件的有效點數規則。",
        );
      }

      let requestedTotalPoints: string;
      let totalSalary: number | undefined;
      try {
        if (input.applicationType === "competition") {
          requestedTotalPoints = calculateCompetitionPoints(
            input.participants,
            {
              allocationMethod: requireRuleValue(
                pointRule,
                "allocation_method",
              ) as "per_person" | "shared_total",
              points: requireRuleValue(pointRule, "points"),
            },
          );
        } else if (input.applicationType === "project_participation") {
          totalSalary = calculateSalary(input);
          requestedTotalPoints = calculateProjectPoints(totalSalary, {
            salaryUnit: Number(pointRule.salary_unit),
            pointsPerUnit: requireRuleValue(pointRule, "points_per_unit"),
            maximumPoints:
              pointRule.maximum_points === null
                ? null
                : requireRuleValue(pointRule, "maximum_points"),
          });
          input.participants[0].requestedPoints = requestedTotalPoints;
        } else if (input.applicationType === "certificate") {
          requestedTotalPoints = calculateCertificatePoints(
            requireRuleValue(pointRule, "points_per_certificate"),
          );
          input.participants[0].requestedPoints = requestedTotalPoints;
        } else {
          requestedTotalPoints = calculateExhibitionPoints(input.participants, {
            minimumPointsPerPerson: requireRuleValue(
              pointRule,
              "minimum_points_per_person",
            ),
            maximumPointsPerPerson: requireRuleValue(
              pointRule,
              "maximum_points_per_person",
            ),
          });
        }
      } catch (error) {
        if (error instanceof PointCalculationError) {
          throw validationError(error.path, error.message);
        }
        throw error;
      }

      const application =
        await ApplicationSubmissionRepository.createApplication(
          client,
          input,
          participantRule.id,
          requestedTotalPoints,
          submittedAt,
          expiresAt,
        );
      await ApplicationSubmissionRepository.createParticipants(
        client,
        application.id,
        input.participants,
      );
      if (input.applicationType === "competition") {
        await ApplicationSubmissionRepository.createCompetitionDetail(
          client,
          application.id,
          input,
          pointRule.id,
        );
      } else if (input.applicationType === "project_participation") {
        await ApplicationSubmissionRepository.createProjectDetail(
          client,
          application.id,
          input,
          pointRule.id,
          totalSalary!,
          requestedTotalPoints,
        );
      } else if (input.applicationType === "certificate") {
        await ApplicationSubmissionRepository.createCertificateDetail(
          client,
          application.id,
          input,
          pointRule.id,
        );
      } else {
        await ApplicationSubmissionRepository.createExhibitionDetail(
          client,
          application.id,
          input,
          pointRule.id,
        );
      }

      const { attachments: _attachments, ...submissionSnapshot } = input;
      const snapshot = {
        ...submissionSnapshot,
        requestedTotalPoints,
      };
      const versionId = await ApplicationSubmissionRepository.createVersion(
        client,
        application.id,
        snapshot,
      );
      for (const metadata of input.attachments) {
        const upload = uploads.get(metadata.clientFileKey)!;
        const attachmentPublicId = randomUUID();
        const storageKey = `attachments/${application.public_id}/1/${attachmentPublicId}${upload.extension}`;
        await storage.saveFromPath(storageKey, upload.temporaryPath);
        storedKeys.push(storageKey);
        await ApplicationSubmissionRepository.createAttachment(client, {
          publicId: attachmentPublicId,
          applicationId: application.id,
          versionId,
          metadata,
          upload,
          storageKey,
        });
      }
      await createAdvisorEmailTasks(
        client,
        input,
        application,
        advisor,
        submittedAt,
        expiresAt,
      );
      return {
        publicId: application.public_id,
        status: "pending_advisor" as const,
        submittedAt: application.submitted_at,
      };
    });
  } catch (error) {
    await Promise.allSettled(storedKeys.map((key) => storage.remove(key)));
    throw error;
  }
}

export const ApplicationSubmissionService = { submitApplication };
