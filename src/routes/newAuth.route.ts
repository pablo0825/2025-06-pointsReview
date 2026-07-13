import express from "express";

import {
  getCsrfToken,
  login,
  logout,
  me,
} from "../controllers/auth.controller";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import { loginRequestSchema } from "../schemas/auth.schema";

const router = express.Router();

router.post(
  "/login",
  validateRequest({ body: loginRequestSchema }),
  asyncHandler(login),
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
