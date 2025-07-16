// pointsTable.models.ts
import mongoose, {
  Schema,
  CallbackWithoutResultAndOptionalError,
} from "mongoose";
import { IPointsTable } from "../types/pointsTable.types";

const groupSchema = new mongoose.Schema({
  contest: { type: Number, min: 0, default: 0 },
  project: { type: Number, min: 0, default: 0 },
  certificates: { type: Number, min: 0, default: 0 },
});

const HistorySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["created", "updated", "status_changed", "note_added"],
    required: true,
  },
  timestamp: { type: Date, required: true, default: Date.now },
  user: { type: String, required: true },
  detail: { type: String },
});

const pointsTableSchema = new Schema<IPointsTable>(
  {
    year: { type: String, required: true },
    studentId: { type: String, required: true },
    name: { type: String, required: true },
    isComplete: { type: Boolean, required: true, default: false },
    group: { type: groupSchema, required: true },
    status: {
      type: String,
      enum: ["在學", "畢業", "轉學", "轉系", "退學", "休學"],
      required: true,
      default: "在學",
    },
    isLocked: { type: Boolean, required: true, default: false },
    history: { type: [HistorySchema], default: [] },
  },
  { timestamps: true }
);

function calculateIsComplete(group: any): boolean {
  if (!group) return false;
  const total =
    (group.contest || 0) + (group.prokect || 0) + (group.certificates || 0);

  return total >= 16;
}

pointsTableSchema.pre("save", function (next) {
  this.isComplete = calculateIsComplete(this.group);
  next();
});

pointsTableSchema.pre(
  "findOneAndUpdate",
  function (next: CallbackWithoutResultAndOptionalError) {
    const update = this.getUpdate();

    if (update && "$set" in update && update.$set?.group) {
      const isComplete = calculateIsComplete(update.$set.group);

      update.$set.isComplete = isComplete;
    }

    next();
  }
);

export const PointsTableDB = mongoose.model<IPointsTable>(
  "pointsTable",
  pointsTableSchema
);
