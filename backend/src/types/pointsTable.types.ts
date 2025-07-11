// pointsTable.types.ts
import { Document } from "mongoose";

export interface IHistory {
  type: "created" | "updated" | "status_changed" | "note_added";
  timestamp: Date;
  user: string;
  detail?: string;
}

export interface IGroup {
  contest: number;
  project: number;
  certificates: number;
}

export interface IPointsTable extends Document {
  year: string;
  studentId: string;
  name: string;
  isComplete: boolean;
  group: IGroup;
  status: "在學" | "畢業" | "轉學" | "轉系" | "退學" | "休學";
  isLocked: boolean;
  history: IHistory[];
}
