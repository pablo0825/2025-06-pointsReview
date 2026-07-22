import express from "express";

import {
  createParticipantRule,
  deactivateParticipantRule,
  listParticipantRules,
} from "../controllers/adminRules.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import {
  createParticipantRuleBodySchema,
  deactivateRuleBodySchema,
  participantRuleListQuerySchema,
  participantRuleParamsSchema,
} from "../schemas/rule.schema";

const router = express.Router();

router.get(
  "/",
  authenticateSession,
  requirePermission("participant_rules.list"),
  validateRequest({ query: participantRuleListQuerySchema }),
  asyncHandler(listParticipantRules),
);
router.post(
  "/",
  authenticateSession,
  csrfProtection,
  requirePermission("participant_rules.create"),
  validateRequest({ body: createParticipantRuleBodySchema }),
  asyncHandler(createParticipantRule),
);
router.post(
  "/:ruleId/deactivate",
  authenticateSession,
  csrfProtection,
  requirePermission("participant_rules.deactivate"),
  validateRequest({
    params: participantRuleParamsSchema,
    body: deactivateRuleBodySchema,
  }),
  asyncHandler(deactivateParticipantRule),
);

export default router;
