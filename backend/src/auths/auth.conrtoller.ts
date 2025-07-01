import { Request, Response } from "express";
import { User } from "../models/user.models";
import { registerSchema, loginSchema } from "../validators/auth.schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError";
import { handleSuccess } from "../utils/handleSuccess";
import { RefreshToken } from "../models/refreshTokens.models";

const auth = require("../middlewares/auth.middleware");

export const register = async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);

  const exists = await User.findOne({ username: data.username });
  if (exists) {
    throw new AppError(400, "false", "使用者已存在");
  }

  const hashed = await bcrypt.hash(data.password, 12);
  const user = await User.create({ username: data.username, password: hashed });

  return handleSuccess(res, 201, "true", "註冊成功", user);
};

export const login = async (req: Request, res: Response) => {
  const { username, password } = loginSchema.parse(req.body);

  const user = await User.findOne({ username: username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError(401, "false", "帳號或密碼錯誤");
  }

  // accessToken - 15分鐘過期
  // refreshToke - 7天過期
  const accessToken = auth.generateAccessToken(
    { id: user.id, name: user.username, email: user.email, roles: user.roles },
    "15m"
  ); // 15 分鐘過期
  const refreshToken = auth.generateRefreshToken({ id: user.id }, "7d");

  let expiresAt: Date;
  try {
    const decodedRefreshToken = jwt.decode(refreshToken) as jwt.JwtPayload;
    if (decodedRefreshToken && decodedRefreshToken.exp) {
      expiresAt = new Date(decodedRefreshToken.exp * 1000); // JWT exp 是 UNIX timestamp (秒)，需要轉換為毫秒
    } else {
      // 如果無法從 token 中獲取過期時間，則根據 expiresIn 參數估算
      // 這需要一個函數來解析 "7d" 這樣的字串，或者直接傳遞 Date 物件給模型
      // 這裡簡化為直接使用 7 天後的日期，但推薦從 JWT 內部獲取
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  } catch (error) {
    console.error("Error decoding refresh token to get expiration:", error);
    // 發生錯誤時的 fallback，例如預設為 7 天後過期
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  // 創建 RefreshToken 模型的實例並儲存資訊
  const newRefreshToken = new RefreshToken({
    userId: user._id, // 確保這裡的 _id 類型與模型定義的 userId 類型匹配
    token: refreshToken,
    expiresAt: expiresAt, // 儲存計算出的過期時間
  });

  try {
    await newRefreshToken.save(); // 使用 .save() 方法將資料寫入資料庫
  } catch (error) {
    console.error("Failed to save refresh token to DB:", error);
    // 根據錯誤類型決定是否拋出 AppError 或其他處理
    throw new AppError(500, "false", "無法儲存 Refresh Token，請稍後再試。");
  }

  // 注意：您程式碼中還有一個 jwt.sign 產生了一個名為 'token' 的 JWT，
  // 並且其過期時間也是 "7d"。這似乎與上面的 accessToken/refreshToken 邏輯重複了。
  // 通常，您只需要回傳 accessToken 和 refreshToken 給前端。
  // 假設這個 'token' 是舊的或是不需要的，我將其註釋掉。
  // const token = jwt.sign(
  //   { id: user._id, role: user.roles },
  //   process.env.JWT_SECRET!,
  //   { expiresIn: "7d" }
  // );

  res.json({
    accessToken: accessToken, // 將 accessToken 回傳給前端
    refreshToken: refreshToken, // 將 refreshToken 回傳給前端
    user: { id: user._id, username: user.username, role: user.roles },
  });
};
