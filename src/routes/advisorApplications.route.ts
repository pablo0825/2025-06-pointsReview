import express from "express";

import {
  getHistoryDetail,
  getPendingDetail,
  approveApplication,
  rejectApplication,
  listHistory,
  listPending,
} from "../controllers/advisorApplications.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { parseAdvisorSignatureUpload } from "../middlewares/advisorSignatureUpload.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import {
  advisorApplicationParamsSchema,
  advisorRejectBodySchema,
  advisorHistoryListQuerySchema,
  advisorPendingListQuerySchema,
} from "../schemas/advisorApplication.schema";

const router = express.Router();

router.get(
  "/pending",
  authenticateSession,
  requirePermission("advisor_applications.pending.list"),
  validateRequest({ query: advisorPendingListQuerySchema }),
  asyncHandler(listPending),
);

router.post(
  "/pending/:publicId/approve",
  authenticateSession,
  csrfProtection,
  requirePermission("advisor_applications.approve"),
  validateRequest({ params: advisorApplicationParamsSchema }),
  parseAdvisorSignatureUpload,
  asyncHandler(approveApplication),
);

router.post(
  "/pending/:publicId/reject",
  authenticateSession,
  csrfProtection,
  requirePermission("advisor_applications.reject"),
  validateRequest({
    params: advisorApplicationParamsSchema,
    body: advisorRejectBodySchema,
  }),
  asyncHandler(rejectApplication),
);

router.get(
  "/pending/:publicId",
  authenticateSession,
  requirePermission("advisor_applications.pending.read"),
  validateRequest({ params: advisorApplicationParamsSchema }),
  asyncHandler(getPendingDetail),
);

router.get(
  "/history",
  authenticateSession,
  requirePermission("advisor_applications.history.list"),
  validateRequest({ query: advisorHistoryListQuerySchema }),
  asyncHandler(listHistory),
);

router.get(
  "/history/:publicId",
  authenticateSession,
  requirePermission("advisor_applications.history.read"),
  validateRequest({ params: advisorApplicationParamsSchema }),
  asyncHandler(getHistoryDetail),
);

export default router;
