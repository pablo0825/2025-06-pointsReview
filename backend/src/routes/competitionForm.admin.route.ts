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
} from "../controllers/competitionForm.admin.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";

const router = Router();
const authMiddleware = require("../middlewares/auth.middleware");

router.get(
  "/",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["user", "admin", "director"]),
  asyncHandler(getAllFormData)
);
router.get(
  "/:id",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["user", "admin", "director"]),
  asyncHandler(getFormById)
);

router.patch(
  "/:id/revise",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["user", "admin", "director"]),
  asyncHandler(reviseFormById)
);
router.post(
  "/:id/approve",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["user", "admin", "director"]),
  asyncHandler(approveFormById)
);
router.post(
  "/:id/reject",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["user", "admin", "director"]),
  asyncHandler(rejectFormByID)
);

router.post(
  "/:id/extend-expiration",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["user", "admin", "director"]),
  asyncHandler(extendExpiryDateById)
);
router.post(
  "/:id/lock",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["admin", "director"]),
  asyncHandler(lockFormById)
);
router.post(
  "/:id/unlock",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["admin", "director"]),
  asyncHandler(unlockFormById)
);

router.delete(
  "/:id/files",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission("admin"),
  asyncHandler(deleteSingleFileById)
);
router.get(
  "/:id/download/:fileName",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["user", "admin", "director"]),
  asyncHandler(downloadSingleFile)
);

export default router;
