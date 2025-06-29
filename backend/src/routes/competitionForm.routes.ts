import express from "express";
import {
  submitForm,
  getFormByToken,
  updatedFormByToKen,
} from "../controllers/competitionForm.controller";

const router = express.Router();

router.post("/", submitForm);
router.get("/edit/:token", getFormByToken);
router.put("/edit/:token", updatedFormByToKen);

export default router;
