// auth.conrtoller.ts
import { Request, Response } from "express";
import { UserDB } from "../../models/user.models";
import { registerSchema, loginSchema } from "../../validators/auth.schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AppError } from "../../utils/AppError";
import { handleSuccess } from "../../utils/handleSuccess";
import { RefreshTokenDB } from "../../models/refreshToken.models";
import { sendResetPasswordEmail } from "../../senders/sendResetPasswordEmail";
import crypto from "crypto";
import { queueFormEmail } from "../../tasks/queueFormEmail";

const authMiddleware = require("../../middlewares/auth.middleware");

// 註冊
export const register = async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);

  const exists = await UserDB.findOne({
    username: data.username,
    isDeleted: false,
  });
  if (exists) {
    throw new AppError(400, "false", "使用者已存在");
  }

  const hashed = await bcrypt.hash(data.password, 12);
  const user = await UserDB.create({
    username: data.username,
    password: hashed,
    email: data.email,
    history: [
      {
        timestamp: new Date(),
        user: data.username,
        detail: `${data.username} 使用者創建`,
      },
    ],
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

  const user = await UserDB.findOne({ username: username, isDeleted: false });
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

// 刷新token
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

    const user = await UserDB.findOne({ _id: decoded._id, isDeleted: false });
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

  res.clearCookie("refreshToken");

  handleSuccess(res, 200, "true", "登出成功", {});
};

// 忘記密碼
export const forgetPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await UserDB.findOne({ email: email, isDeleted: false });
  if (!user) {
    throw new AppError(404, "false", "查無此帳號。");
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashedDbToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.resetPasswordToken = hashedDbToken;
  user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);

  const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  // 若 resetToken 過去 5 分鐘內已發送過，則不再寄出
  const lastReset = user.history.find(
    (h) =>
      /*    typeof h.detail === "string" && */
      h.detail?.includes("重設密碼") &&
      new Date().getTime() - new Date(h.timestamp).getTime() < 5 * 60 * 1000
  );
  if (lastReset) {
    throw new AppError(429, "false", "請稍後再試，您已請求過密碼重設。");
  }

  try {
    await sendResetPasswordEmail(user.email, user.username, resetURL);
  } catch (err) {
    console.error("發送重設密碼郵件失敗:", err);

    // throw new AppError(500, "false", "郵件發送失敗，請稍後再試。");
  }

  user.history.push({
    timestamp: new Date(),
    user: user.username || "user",
    detail: `${user.username} 使用者重設密碼`,
  });

  await user.save();

  handleSuccess(res, 200, "true", "重設密碼連結已寄出，請至信箱查收。", {});
};

// 重設密碼
export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token) {
    throw new AppError(401, "false", "缺少重設密碼連結。");
  }
  if (!newPassword) {
    throw new AppError(401, "false", "請輸入新密碼。");
  }

  const hashedTokenFromRequest = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await UserDB.findOne({
    resetPasswordToken: hashedTokenFromRequest,
    resetPasswordExpires: { $gt: Date.now() },
    isDeleted: false,
  });
  if (!user) {
    throw new AppError(404, "false", "使用者不存在");
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  user.password = hashed;
  user.history.push({
    timestamp: new Date(),
    user: user.username || "user",
    detail: `${user.username} 使用者更新密碼成功`,
  });

  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;

  await user.save();

  return handleSuccess(res, 200, "true", "密碼重設成功", {});
};
