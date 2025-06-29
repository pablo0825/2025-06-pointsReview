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
} from "../controllers/competitionForm.admin.controller";

const router = Router();

router.get("/", getAllFormDate);
router.get("/:id", getFormById);

router.patch("/:id/revise", reviseFormById);
router.post("/:id/approve", approveFormById);
router.post("/:id/reject", rejectFormByID);

router.post("/:id/extend-expiration", extendExpiryDateById);
router.post("/:id/lock", lockFormById);
router.post("/:id/unlock", unlockFormById);

export default router;
