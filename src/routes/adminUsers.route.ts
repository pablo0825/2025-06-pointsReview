import express from "express";

import {
  activateUser,
  createUser,
  deactivateUser,
  getUserDetail,
  listUsers,
  resendActivation,
  sendPasswordReset,
  transferAdmin,
  updateUser,
} from "../controllers/adminUsers.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import {
  adminUserListQuerySchema,
  adminUserEmptyBodySchema,
  adminUserParamsSchema,
  createAdminUserBodySchema,
  deactivateAdminUserBodySchema,
  transferAdminBodySchema,
  updateAdminUserBodySchema,
} from "../schemas/adminUser.schema";

const router = express.Router();

router.post(
  "/",
  authenticateSession,
  csrfProtection,
  requirePermission("users.create"),
  validateRequest({ body: createAdminUserBodySchema }),
  asyncHandler(createUser),
);

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
  validateRequest({
    params: adminUserParamsSchema,
    body: adminUserEmptyBodySchema,
  }),
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

router.post(
  "/:userId/resend-activation",
  authenticateSession,
  csrfProtection,
  requirePermission("users.activation.resend"),
  validateRequest({
    params: adminUserParamsSchema,
    body: adminUserEmptyBodySchema,
  }),
  asyncHandler(resendActivation),
);

router.post(
  "/:userId/send-password-reset",
  authenticateSession,
  csrfProtection,
  requirePermission("users.password_reset.send"),
  validateRequest({
    params: adminUserParamsSchema,
    body: adminUserEmptyBodySchema,
  }),
  asyncHandler(sendPasswordReset),
);

router.post(
  "/:userId/transfer-admin",
  authenticateSession,
  csrfProtection,
  requirePermission("users.transfer_admin"),
  validateRequest({
    params: adminUserParamsSchema,
    body: transferAdminBodySchema,
  }),
  asyncHandler(transferAdmin),
);

export default router;
