// pointsTask.models.ts
import mongoose, { Schema } from "mongoose";
import { IPonintsTask } from "../types/pointsTask.type";

const pointsTaskSchema = new Schema(
  {
    formId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompetitionForm",
      required: true,
    },
    studentId: { type: String, required: true },
    name: { type: String, required: true },
    points: { type: Number, required: true, min: 0 },
    retries: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    err: { type: String, default: undefined },
    /*   nextAttemptAt: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000),
    }, */
  },
  { timestamps: true }
);

export const PointsTaskDB = mongoose.model<IPonintsTask>(
  "pointsTask",
  pointsTaskSchema
);
