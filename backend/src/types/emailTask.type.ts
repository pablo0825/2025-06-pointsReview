//emailTask.type.ts
import mongoose, { Document } from "mongoose";

export interface IEmailTask extends Document {
  formId: mongoose.Types.ObjectId;
  to: string;
  subject: string;
  templateName: string;
  templateData: mongoose.Schema.Types.Mixed;
  retries: number;
  maxRetries: number;
  status: "pending" | "sent" | "failed";
  error: string;
  sentAt: Date;
  createdAt: Date;
}
