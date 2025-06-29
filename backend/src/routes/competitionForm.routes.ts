import express from "express";
import {
  submitForm,
  getFormByToken,
  updatedFormByToKen,
} from "../controllers/competitionForm.controller";
import { upload } from "../middlewares/upload.middleware";

const router = express.Router();

router.post("/", upload.array("files", 10), submitForm);
router.get("/edit/:token", getFormByToken);
router.put("/edit/:token", upload.array("files", 10), updatedFormByToKen);

export default router;
