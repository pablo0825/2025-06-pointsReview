import express from "express";

import { listPublicInstructions } from "../controllers/applicationInstructions.controller";
import { listPublicAdvisors } from "../controllers/public.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import { publicApplicationInstructionQuerySchema } from "../schemas/applicationInstruction.schema";

const router = express.Router();

router.get("/advisors", asyncHandler(listPublicAdvisors));
router.get(
  "/application-instructions",
  validateRequest({ query: publicApplicationInstructionQuerySchema }),
  asyncHandler(listPublicInstructions),
);

export default router;
