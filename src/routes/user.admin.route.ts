// auth.route.ts
import express from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import {
  deleteUserById,
  assignRoleById,
  getAllUserData,
  updatedUserDataById,
  getMe,
} from "../controllers/user/user.admin.controller";

const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.get(
  "/",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["admin", "director"]),
  asyncHandler(getAllUserData)
);
router.put(
  "/edit/:id",
  authMiddleware.authenticateToken,
  asyncHandler(updatedUserDataById)
);
router.patch(
  "/:id/role",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["admin", "director"]),
  asyncHandler(assignRoleById)
);
router.delete(
  "/:id/delete",
  authMiddleware.authenticateToken,
  authMiddleware.hasPermission(["admin", "director"]),
  asyncHandler(deleteUserById)
);
router.get("/me", authMiddleware.authenticateToken, asyncHandler(getMe));

export default router;
