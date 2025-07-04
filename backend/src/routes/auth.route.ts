// auth.route.ts
import express from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import {
  login,
  logout,
  refresh,
  register,
  forgetPassword,
  resetPassword,
} from "../controllers/auths/auth.conrtoller";

const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/register", asyncHandler(register));
router.post("/login", asyncHandler(login));
router.post("/logout", asyncHandler(logout));
router.post("/refreshToken", asyncHandler(refresh));
router.post("/forget-password", asyncHandler(forgetPassword));
router.post("/reset-password", asyncHandler(resetPassword));

export default router;
