import mongoose, { Schema } from "mongoose";
import { IUser } from "../types/user.type";

const userSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, required: true },
  roles: {
    type: String,
    enum: ["user", "admin", "director"],
    default: "user",
  },
});

export const UserDB = mongoose.model<IUser>("User", userSchema);
