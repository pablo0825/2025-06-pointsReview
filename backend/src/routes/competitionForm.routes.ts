import express from "express";
import {
  submitForm,
  getFormByToken,
  updatedFormByToKen,
} from "../controllers/competitionForm.controller";
import { upload } from "../middlewares/upload.middleware";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = express.Router();

router.post("/", upload.array("files", 10), asyncHandler(submitForm));
router.get("/edit/:token", asyncHandler(getFormByToken));
router.put(
  "/edit/:token",
  upload.array("files", 10),
  asyncHandler(updatedFormByToKen)
);

export default router;
