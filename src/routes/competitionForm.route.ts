import express from "express";
import {
  submitForm,
  getFormByToken,
  updatedFormByToKen,
  verifyAdvisorToken,
  advisorConfirmedByToken,
} from "../controllers/competitionForm.controller";
import { upload } from "../middlewares/upload.middleware";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";

const router = express.Router();

router.post("/", upload.array("files", 10), asyncHandler(submitForm));
router.get("/edit/:token", asyncHandler(getFormByToken));
router.put(
  "/edit/:token",
  upload.array("files", 10),
  asyncHandler(updatedFormByToKen)
);
router.get("/verify-teacher/:token", asyncHandler(verifyAdvisorToken));
router.post("/verify-teacher/:token", asyncHandler(advisorConfirmedByToken));

export default router;
