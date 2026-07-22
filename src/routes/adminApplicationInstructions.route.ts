import express from "express";

import {
  createInstruction,
  hideInstruction,
  listAdminInstructions,
  showInstruction,
  updateInstruction,
} from "../controllers/applicationInstructions.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import {
  adminApplicationInstructionListQuerySchema,
  applicationInstructionParamsSchema,
  createApplicationInstructionBodySchema,
  emptyInstructionActionBodySchema,
  updateApplicationInstructionBodySchema,
} from "../schemas/applicationInstruction.schema";

const router = express.Router();

router.get(
  "/",
  authenticateSession,
  requirePermission("application_instructions.list"),
  validateRequest({ query: adminApplicationInstructionListQuerySchema }),
  asyncHandler(listAdminInstructions),
);
router.post(
  "/",
  authenticateSession,
  csrfProtection,
  requirePermission("application_instructions.create"),
  validateRequest({ body: createApplicationInstructionBodySchema }),
  asyncHandler(createInstruction),
);
router.patch(
  "/:instructionId",
  authenticateSession,
  csrfProtection,
  requirePermission("application_instructions.update"),
  validateRequest({
    params: applicationInstructionParamsSchema,
    body: updateApplicationInstructionBodySchema,
  }),
  asyncHandler(updateInstruction),
);

for (const [path, handler] of [
  ["show", showInstruction],
  ["hide", hideInstruction],
] as const) {
  router.post(
    `/:instructionId/${path}`,
    authenticateSession,
    csrfProtection,
    requirePermission("application_instructions.visibility"),
    validateRequest({
      params: applicationInstructionParamsSchema,
      body: emptyInstructionActionBodySchema,
    }),
    asyncHandler(handler),
  );
}

export default router;
