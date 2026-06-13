//emailTask.type.ts
import mongoose, { Document } from "mongoose";

export interface IPonintsTask extends Document {
  formId: mongoose.Types.ObjectId;
  studentId: string;
  name: string;
  points: number;
  retries: number;
  maxRetries: number;
  status: "pending" | "processing" | "success" | "failed";
  err: string | undefined;
}
