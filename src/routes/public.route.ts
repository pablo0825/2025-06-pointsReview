import express from "express";

import { listPublicInstructions } from "../controllers/applicationInstructions.controller";
import { listPublicAdvisors } from "../controllers/public.controller";
import { submitApplication } from "../controllers/applicationSubmission.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { parseApplicationUpload } from "../middlewares/applicationUpload.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import { publicApplicationInstructionQuerySchema } from "../schemas/applicationInstruction.schema";

const router = express.Router();

router.get("/advisors", asyncHandler(listPublicAdvisors));
router.post(
  "/applications",
  parseApplicationUpload,
  asyncHandler(submitApplication),
);
router.get(
  "/application-instructions",
  validateRequest({ query: publicApplicationInstructionQuerySchema }),
  asyncHandler(listPublicInstructions),
);

export default router;
