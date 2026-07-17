import express from "express";

import {
  activateUser,
  deactivateUser,
  getUserDetail,
  listUsers,
  updateUser,
} from "../controllers/adminUsers.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import {
  adminUserListQuerySchema,
  adminUserParamsSchema,
  deactivateAdminUserBodySchema,
  updateAdminUserBodySchema,
} from "../schemas/adminUser.schema";

const router = express.Router();

router.get(
  "/",
  authenticateSession,
  requirePermission("users.list"),
  validateRequest({ query: adminUserListQuerySchema }),
  asyncHandler(listUsers),
);

router.get(
  "/:userId",
  authenticateSession,
  requirePermission("users.read"),
  validateRequest({ params: adminUserParamsSchema }),
  asyncHandler(getUserDetail),
);

router.patch(
  "/:userId",
  authenticateSession,
  csrfProtection,
  requirePermission("users.update"),
  validateRequest({
    params: adminUserParamsSchema,
    body: updateAdminUserBodySchema,
  }),
  asyncHandler(updateUser),
);

router.post(
  "/:userId/activate",
  authenticateSession,
  csrfProtection,
  requirePermission("users.activate"),
  validateRequest({ params: adminUserParamsSchema }),
  asyncHandler(activateUser),
);

router.post(
  "/:userId/deactivate",
  authenticateSession,
  csrfProtection,
  requirePermission("users.deactivate"),
  validateRequest({
    params: adminUserParamsSchema,
    body: deactivateAdminUserBodySchema,
  }),
  asyncHandler(deactivateUser),
);

export default router;
