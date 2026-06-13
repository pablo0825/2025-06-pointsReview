import { Document } from "mongoose";

export interface IHistory {
  timestamp: Date;
  user: string;
  detail?: string;
}

export interface IUser extends Document {
  username: string;
  password: string;
  email: string;
  roles: string;
  isDeleted: Boolean;
  history: IHistory[];
  resetPasswordToken: string | undefined;
  resetPasswordExpires: Date | undefined;
}
