import { Router } from "express";
import {
  getAllFormDate,
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

router.get("/", asyncHandler(getAllFormDate));
router.get("/:id", asyncHandler(getFormById));

router.patch("/:id/revise", asyncHandler(reviseFormById));
router.post("/:id/approve", asyncHandler(approveFormById));
router.post("/:id/reject", asyncHandler(rejectFormByID));

router.post("/:id/extend-expiration", asyncHandler(extendExpiryDateById));
router.post("/:id/lock", asyncHandler(lockFormById));
router.post("/:id/unlock", asyncHandler(unlockFormById));

router.delete("/:id/files", asyncHandler(deleteSingleFileById));
router.get("/:id/download/:fileName", asyncHandler(downloadSingleFile));

export default router;
