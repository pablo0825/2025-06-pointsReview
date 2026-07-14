import { Router } from "express";
import {
  getAllFormData,
  getFormById,
  reviseFormById,
  approveFormById,
  rejectFormByID,
  extendExpiryDateById,
  lockFormById,
  unlockFormById,
  deleteSingleFileById,
  downloadSingleFile,
  resendTeacherToken,
} from "../controllers/competitionForm.admin.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import {
  requireAnyPermission,
  requirePermission,
} from "../middlewares/permission.middleware";

const router = Router();

const canListApplications = requireAnyPermission([
  "applications.review.list",
  "applications.all.list",
]);
const canReadApplications = requireAnyPermission([
  "applications.review.read",
  "applications.all.read",
]);
const canReviewApplications = requireAnyPermission([
  "applications.revision.request",
  "applications.approve",
  "applications.reject",
  "applications.all.read",
]);
const canExtendRevision = requireAnyPermission([
  "applications.revision.extend",
  "applications.all.read",
]);
const canReadAttachments = requirePermission("applications.attachments.read");
const canAdminReadApplications = requirePermission("applications.all.read");

router.get(
  "/",
  authenticateSession,
  canListApplications,
  asyncHandler(getAllFormData)
);
router.get(
  "/:id",
  authenticateSession,
  canReadApplications,
  asyncHandler(getFormById)
);

router.patch(
  "/:id/revise",
  authenticateSession,
  csrfProtection,
  canReviewApplications,
  asyncHandler(reviseFormById)
);
router.post(
  "/:id/approve",
  authenticateSession,
  csrfProtection,
  canReviewApplications,
  asyncHandler(approveFormById)
);
router.post(
  "/:id/reject",
  authenticateSession,
  csrfProtection,
  canReviewApplications,
  asyncHandler(rejectFormByID)
);

router.post(
  "/:id/extend-expiration",
  authenticateSession,
  csrfProtection,
  canExtendRevision,
  asyncHandler(extendExpiryDateById)
);
router.post(
  "/:id/lock",
  authenticateSession,
  csrfProtection,
  canAdminReadApplications,
  asyncHandler(lockFormById)
);
router.post(
  "/:id/unlock",
  authenticateSession,
  csrfProtection,
  canAdminReadApplications,
  asyncHandler(unlockFormById)
);

router.delete(
  "/:id/files",
  authenticateSession,
  csrfProtection,
  canAdminReadApplications,
  asyncHandler(deleteSingleFileById)
);
router.get(
  "/:id/download/:fileName",
  authenticateSession,
  canReadAttachments,
  asyncHandler(downloadSingleFile)
);

router.post(
  "/:id/resend",
  authenticateSession,
  csrfProtection,
  canReviewApplications,
  asyncHandler(resendTeacherToken)
);

export default router;
