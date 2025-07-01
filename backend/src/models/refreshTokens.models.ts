import mongoose, { Schema } from "mongoose";
import { IRefreshTokens } from "../types/refreshTokens.type";

const refreshTokenSchema = new Schema<IRefreshTokens>({
  token: { type: Schema.Types.ObjectId, required: true, unique: true },
  userId: { type: String, required: true }, //使用者的ID，之後在新增user的model後，可以改成連動的方式
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, //過期時間(用於清除過期的token)
  createdAt: { type: Date, default: Date.now }, //建立時間
  revokedAt: { type: Date }, //作廢時間
});

export const RefreshToken = mongoose.model<IRefreshTokens>(
  "RefreshToken",
  refreshTokenSchema
);
