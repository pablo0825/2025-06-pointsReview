import mongoose, { Schema, Query } from "mongoose";
import { IUser } from "../types/user.type";

const HistorySchema = new mongoose.Schema({
  timestamp: { type: Date, required: true, default: Date.now },
  user: { type: String, required: true },
  detail: { type: String },
});

const userSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  roles: {
    type: String,
    enum: ["handle", "admin", "director", "noRole"],
    default: "noRole",
  },
  isDeleted: { type: Boolean, default: false },
  history: { type: [HistorySchema], default: [] },
  resetPasswordToken: { type: String, default: undefined },
  resetPasswordExpires: { type: Date, default: undefined },
});

export const UserDB = mongoose.model<IUser>("User", userSchema);
