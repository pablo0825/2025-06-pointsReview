import express from "express";

import {
  activateAdvisor,
  assignDirector,
  createAdvisor,
  deactivateAdvisor,
  listAdvisors,
  updateAdvisor,
} from "../controllers/adminAdvisors.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import {
  adminAdvisorListQuerySchema,
  adminAdvisorEmptyBodySchema,
  adminAdvisorParamsSchema,
  advisorActionBodySchema,
  createAdminAdvisorBodySchema,
  updateAdminAdvisorBodySchema,
} from "../schemas/adminAdvisor.schema";

const router = express.Router();

router.post(
  "/",
  authenticateSession,
  csrfProtection,
  requirePermission("advisors.create"),
  validateRequest({ body: createAdminAdvisorBodySchema }),
  asyncHandler(createAdvisor),
);

router.get(
  "/",
  authenticateSession,
  requirePermission("advisors.list"),
  validateRequest({ query: adminAdvisorListQuerySchema }),
  asyncHandler(listAdvisors),
);

router.patch(
  "/:advisorId",
  authenticateSession,
  csrfProtection,
  requirePermission("advisors.update"),
  validateRequest({
    params: adminAdvisorParamsSchema,
    body: updateAdminAdvisorBodySchema,
  }),
  asyncHandler(updateAdvisor),
);

router.post(
  "/:advisorId/activate",
  authenticateSession,
  csrfProtection,
  requirePermission("advisors.activate"),
  validateRequest({
    params: adminAdvisorParamsSchema,
    body: adminAdvisorEmptyBodySchema,
  }),
  asyncHandler(activateAdvisor),
);

router.post(
  "/:advisorId/deactivate",
  authenticateSession,
  csrfProtection,
  requirePermission("advisors.deactivate"),
  validateRequest({
    params: adminAdvisorParamsSchema,
    body: advisorActionBodySchema,
  }),
  asyncHandler(deactivateAdvisor),
);

router.post(
  "/:advisorId/assign-director",
  authenticateSession,
  csrfProtection,
  requirePermission("advisors.assign_director"),
  validateRequest({
    params: adminAdvisorParamsSchema,
    body: advisorActionBodySchema,
  }),
  asyncHandler(assignDirector),
);

export default router;
