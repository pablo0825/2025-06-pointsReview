import express from "express";

import {
  activateAccount,
  getCsrfToken,
  login,
  logout,
  me,
  requestPasswordReset,
  resetPassword,
} from "../controllers/auth.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import {
  accountPasswordBodySchema,
  accountTokenParamsSchema,
  loginRequestSchema,
  passwordResetRequestBodySchema,
} from "../schemas/auth.schema";

const router = express.Router();

router.post(
  "/login",
  validateRequest({ body: loginRequestSchema }),
  asyncHandler(login),
);

router.post(
  "/activation/:token",
  validateRequest({
    params: accountTokenParamsSchema,
    body: accountPasswordBodySchema,
  }),
  asyncHandler(activateAccount),
);

router.post(
  "/password-reset/request",
  validateRequest({ body: passwordResetRequestBodySchema }),
  asyncHandler(requestPasswordReset),
);

router.post(
  "/password-reset/:token",
  validateRequest({
    params: accountTokenParamsSchema,
    body: accountPasswordBodySchema,
  }),
  asyncHandler(resetPassword),
);

router.post(
  "/logout",
  authenticateSession,
  csrfProtection,
  asyncHandler(logout),
);

router.get("/me", authenticateSession, asyncHandler(me));
router.get("/csrf-token", authenticateSession, asyncHandler(getCsrfToken));

export default router;
