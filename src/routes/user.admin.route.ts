// user.admin.route.ts
import express from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import {
  deleteUserById,
  assignRoleById,
  getAllUserData,
  updatedUserDataById,
  getMe,
} from "../controllers/user/user.admin.controller";
import { authenticateSession } from "../middlewares/authentication.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = express.Router();

router.get(
  "/",
  authenticateSession,
  requirePermission("users.list"),
  asyncHandler(getAllUserData)
);
router.put(
  "/edit/:id",
  authenticateSession,
  csrfProtection,
  asyncHandler(updatedUserDataById)
);
router.patch(
  "/:id/role",
  authenticateSession,
  csrfProtection,
  requirePermission("users.update"),
  asyncHandler(assignRoleById)
);
router.delete(
  "/:id/delete",
  authenticateSession,
  csrfProtection,
  requirePermission("users.deactivate"),
  asyncHandler(deleteUserById)
);
router.get("/me", authenticateSession, asyncHandler(getMe));

export default router;
