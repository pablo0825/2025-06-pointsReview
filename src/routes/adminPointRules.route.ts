import express from "express";

import {
  createPointRule,
  deactivatePointRule,
  listPointRules,
} from "../controllers/adminRules.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import {
  createPointRuleBodySchema,
  deactivateRuleBodySchema,
  pointRuleListQuerySchema,
  pointRuleParamsSchema,
} from "../schemas/rule.schema";

const router = express.Router();

router.get(
  "/",
  authenticateSession,
  requirePermission("point_rules.list"),
  validateRequest({ query: pointRuleListQuerySchema }),
  asyncHandler(listPointRules),
);
router.post(
  "/",
  authenticateSession,
  csrfProtection,
  requirePermission("point_rules.create"),
  validateRequest({ body: createPointRuleBodySchema }),
  asyncHandler(createPointRule),
);
router.post(
  "/:applicationType/:ruleId/deactivate",
  authenticateSession,
  csrfProtection,
  requirePermission("point_rules.deactivate"),
  validateRequest({
    params: pointRuleParamsSchema,
    body: deactivateRuleBodySchema,
  }),
  asyncHandler(deactivatePointRule),
);

export default router;
