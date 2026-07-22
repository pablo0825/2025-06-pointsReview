import type { Request, Response } from "express";

import {
  cleanupTemporarySignature,
  type AdvisorSignatureUploadRequest,
} from "../middlewares/advisorSignatureUpload.middleware";
import type {
  AdvisorRejectBody,
  AdvisorHistoryListQuery,
  AdvisorPendingListQuery,
} from "../schemas/advisorApplication.schema";
import { AdvisorApplicationService } from "../services/advisorApplication.service";
import { getRequestContext } from "../utils/requestContext";

function currentUserId(req: Request): string {
  if (!req.auth) {
    throw new Error("Authenticated advisor route reached without auth context");
  }
  return req.auth.user.id;
}

export async function listPending(req: Request, res: Response) {
  const query = req.query as unknown as AdvisorPendingListQuery;
  const result = await AdvisorApplicationService.listPending(
    currentUserId(req),
    query,
  );
  res.status(200).json({
    data: result.items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / query.pageSize),
    },
  });
}

export async function getPendingDetail(req: Request, res: Response) {
  const application = await AdvisorApplicationService.getPendingDetail(
    currentUserId(req),
    String(req.params.publicId),
  );
  res.status(200).json({ data: { application } });
}

export async function listHistory(req: Request, res: Response) {
  const query = req.query as unknown as AdvisorHistoryListQuery;
  const result = await AdvisorApplicationService.listHistory(
    currentUserId(req),
    query,
  );
  res.status(200).json({
    data: result.items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / query.pageSize),
    },
  });
}

export async function getHistoryDetail(req: Request, res: Response) {
  const application = await AdvisorApplicationService.getHistoryDetail(
    currentUserId(req),
    String(req.params.publicId),
  );
  res.status(200).json({ data: { application } });
}

function actionContext(req: Request) {
  const context = getRequestContext(req);
  return {
    userId: currentUserId(req),
    ipAddress: context.ipAddress ?? "0.0.0.0",
    userAgent: context.userAgent ?? "unknown",
  };
}

export async function approveApplication(
  req: AdvisorSignatureUploadRequest,
  res: Response,
) {
  try {
    if (!req.advisorApprovePayload || !req.validatedSignature) {
      throw new Error("Signature upload middleware did not provide input");
    }
    const result = await AdvisorApplicationService.approve(
      String(req.params.publicId),
      req.advisorApprovePayload,
      req.validatedSignature,
      actionContext(req),
    );
    res.status(200).json({
      data: { status: result.status, signedAt: result.signedAt.toISOString() },
    });
  } finally {
    await cleanupTemporarySignature(req);
  }
}

export async function rejectApplication(req: Request, res: Response) {
  const result = await AdvisorApplicationService.reject(
    String(req.params.publicId),
    req.body as AdvisorRejectBody,
    actionContext(req),
  );
  res.status(200).json({
    data: { status: result.status, closedAt: result.closedAt.toISOString() },
  });
}
