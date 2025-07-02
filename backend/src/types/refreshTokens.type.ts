import mongoose, { Document } from "mongoose";

export interface IRefreshTokens extends Document {
  token: String;
  userId: mongoose.Types.ObjectId; //使用者的ID
  expiresAt: Date; //過期時間(用於清除過期的token)
  createdAt: Date; //建立時間
  revokedAt: Date; //作廢時間
}
