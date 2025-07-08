//emailTask.model.ts
import mongoose, { Schema } from "mongoose";
import { IEmailTask } from "../types/emailTask.type";

const emailTaskSchema = new Schema({
  formId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompetitionForm",
    required: true,
  },
  to: { type: String, required: true },
  subject: { type: String, required: true },
  templateName: { type: String, required: true },
  templateData: { type: mongoose.Schema.Types.Mixed, required: true },
  retries: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  status: {
    type: String,
    enum: ["pending", "sent", "failed"],
    default: "pending",
  },
  error: { type: String },
  sentAt: { type: Date, default: undefined },
  createdAt: { type: Date, default: Date.now },
});

export const EmailTaskDB = mongoose.model<IEmailTask>(
  "EmailTask",
  emailTaskSchema
);
