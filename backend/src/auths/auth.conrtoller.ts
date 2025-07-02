// auth.conrtoller.ts
import { Request, Response } from "express";
import { UserDB } from "../models/user.models";
import { registerSchema, loginSchema } from "../validators/auth.schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError";
import { handleSuccess } from "../utils/handleSuccess";
import { RefreshTokenDB } from "../models/refreshToKen.models";
import mongoose from "mongoose";
import { string } from "zod";

const authMiddleware = require("../middlewares/auth.middleware");

// 註冊
export const register = async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);

  const exists = await UserDB.findOne({ username: data.username });
  if (exists) {
    throw new AppError(400, "false", "使用者已存在");
  }

  const hashed = await bcrypt.hash(data.password, 12);
  const user = await UserDB.create({
    username: data.username,
    password: hashed,
  });

  return handleSuccess(res, 201, "true", "註冊成功", {
    user: {
      id: user._id,
      username: user.username,
    },
  });
};

// 登入
export const login = async (req: Request, res: Response) => {
  const { username, password } = loginSchema.parse(req.body);

  const user = await UserDB.findOne({ username: username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError(401, "false", "帳號或密碼錯誤");
  }

  // accessToken - 15分鐘過期
  // refreshToke - 7天過期
  const accessToken = authMiddleware.generateAccessToken(
    { id: user._id, name: user.username, email: user.email, roles: user.roles },
    "15m"
  );
  const refreshToken = authMiddleware.generateRefreshToken(
    { id: user._id },
    "7d"
  );

  /*  let expiresAt: Date;
  try {
    const decodedRefreshToken = jwt.decode(refreshToken) as jwt.JwtPayload;

    if (decodedRefreshToken && decodedRefreshToken.exp) {
      expiresAt = new Date(decodedRefreshToken.exp * 1000); // JWT exp 是 UNIX timestamp (秒)，需要轉換為毫秒
    } else {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  } catch (error) {
    console.error("Error decoding refresh token to get expiration:", error);

    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
 */

  const decoded = jwt.decode(refreshToken) as jwt.JwtPayload;
  const expiresAt = new Date(decoded.exp! * 1000);

  // 創建 RefreshToken 模型的實例並儲存資訊
  const newRefreshTokenDB = new RefreshTokenDB({
    token: refreshToken,
    userId: user._id,
    expiresAt: expiresAt,
  });

  try {
    await newRefreshTokenDB.save();
  } catch (error) {
    console.error("Failed to save refresh token to DB:", error);

    throw new AppError(500, "false", "無法儲存 Refresh Token，請稍後再試。");
  }

  // 將 refreshToken 存到 httpOnly裡面
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    path: "/",
  });

  // 將 accessToken 回傳給前端
  handleSuccess(res, 200, "true", "登入成功", {
    accessToken: accessToken,
    user: { id: user._id, username: user.username, role: user.roles },
  });
};

// 刷新
export const refresh = async (req: Request, res: Response) => {
  const refreshTokenFromCookie = req.cookies.refreshToken;
  if (!refreshTokenFromCookie) {
    throw new AppError(401, "false", "缺少 refresh token");
  }

  const storedToken = await RefreshTokenDB.findOne({
    token: refreshTokenFromCookie,
  });
  if (!storedToken) {
    res.clearCookie("refreshToken");
    throw new AppError(
      403,
      "false",
      "refresh token 無效或已作廢，請重新登入。"
    );
  }

  try {
    const decoded = jwt.verify(
      refreshTokenFromCookie,
      authMiddleware.JWT_REFRESH_SECRET
    ) as jwt.JwtPayload;

    if (decoded.id !== storedToken.userId.toString()) {
      res.clearCookie("refreshToken");
      throw new AppError(
        403,
        "false",
        "Refresh Token 使用者 ID 不匹配，請重新登入。"
      );
    }

    storedToken.revokedAt = new Date(Date.now());
    await storedToken.save();

    const user = await UserDB.findById(decoded._id);
    if (!user) {
      throw new AppError(404, "false", "使用者不存在，請重新登入。");
    }

    const newAccessToken = authMiddleware.generateAccessToken(
      {
        id: user._id,
        username: user.username,
        roles: user.roles,
      },
      "15m"
    );

    const newRefreshToken = authMiddleware.generateRefreshToken(
      { id: user._id },
      "7d"
    );

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
      path: "/",
    });

    handleSuccess(res, 200, "true", "登入成功", {
      accessToken: newAccessToken,
      user: {
        id: user._id,
        username: user.username,
        role: user.roles,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("Refresh Token validation error:", err.message);
    }

    res.clearCookie("refreshToken");
    throw new AppError(
      403,
      "false",
      "Refresh Token 無效或已過期，請重新登入。"
    );
  }
};

//登出
export const logout = async (req: Request, res: Response) => {
  const refreshTokenFromCookie = req.cookies.refreshToken;
  if (!refreshTokenFromCookie) {
    throw new AppError(401, "false", "缺少 refresh token");
  }

  const storedToken = await RefreshTokenDB.findOne({
    token: refreshTokenFromCookie,
  });
  if (!storedToken) {
    res.clearCookie("refreshToken");
    throw new AppError(
      403,
      "false",
      "refresh token 無效或已作廢，請重新登入。"
    );
  }

  storedToken.revokedAt = new Date(Date.now());
  await storedToken.save();

  res.clearCookie("refreshToken");

  handleSuccess(res, 200, "true", "登出成功", {});
};

export const getMe = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "false", "尚未驗證身分，請重新登入");
  }

  const user = await UserDB.findById(userId).select("-password");
  if (!user) {
    throw new AppError(404, "false", "找不到使用者資訊");
  }

  handleSuccess(res, 200, "true", "取得使用者資訊成功", {
    id: user._id,
    username: user.username,
    email: user.email,
    roles: user.roles,
  });
};

export const assignRole = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  const { role } = req.body;

  const allowedRoles = ["user", "admin", "director"];
  if (typeof role !== "string" || !allowedRoles.includes(role)) {
    throw new AppError(400, "false", "提供的角色不合法");
  }

  const user = await UserDB.findById(id);
  if (!user) {
    throw new AppError(404, "false", "找不到使用者");
  }

  if (user.roles.includes("admin") && !role.includes("admin")) {
    throw new AppError(403, "false", "不能移除管理員身份");
  }

  user.roles = role;
  await user.save();

  return handleSuccess(res, 200, "true", "角色更新成功", {
    id: user._id,
    username: user.username,
    roles: user.roles,
  });
};
