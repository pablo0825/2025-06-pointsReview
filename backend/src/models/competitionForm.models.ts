import mongoose, { Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { ICompetitionForm, IStudent } from "../types/competitionForm.type";

const StudentSchema = new mongoose.Schema({
  class: { type: String, required: true },
  studentId: { type: String, required: true },
  name: { type: String, required: true },

  pointSubmitted: { type: Number, required: true, min: 0 }, //提交點數
  //pointApproved: { type: Number, min: 0 }, // 核准點數
  //pointComment: { type: String }, // 核准原因

  //approvedBy: { type: String }, //核准人
  //approvedAt: { type: Date }, //核准時間
});

const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
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

const CompetitionFormSchema = new Schema<ICompetitionForm>({
  level: {
    type: String,
    enum: ["國際級整合", "國際級非整合", "全國性整合", "全國性非整合", "其他"],
    required: true,
  }, //比賽等級
  levelOther: { type: String }, //其他比賽等級
  name: { type: String, required: true }, //比賽名稱
  group: { type: String }, //比賽分組
  award: {
    type: String,
    enum: ["第一名", "第二名", "第三名", "佳作", "入圍", "參賽", "其他"],
    required: true,
  }, //比賽名次
  awardOther: { type: String }, //其他名次
  date: { type: Date, required: true }, //申請時間
  totalPoints: { type: Number, required: true, min: 0 }, //總點數
  students: {
    type: [StudentSchema],
    required: true,
    validate: {
      validator: (v: IStudent[]) => v.length > 0,
      message: "至少需要一位學生",
    },
  }, //申請學生
  evidenceFileUrls: { type: [String], required: true }, //佐證資料URL
  contact: { type: ContactSchema, required: true }, //主要聯絡人
  advisor: { type: String, required: true }, //指導老師
  status: {
    type: String,
    enum: [
      "submitted",
      "needs_revision",
      "resubmitted",
      "approved",
      "rejected",
      "expired",
    ],
    required: true,
    default: "submitted",
  }, //狀態
  revisionNote: { type: String }, //補件原因
  rejectedReason: { type: String }, //拒絕原因
  editToken: { type: String, required: true, unique: true, default: uuidv4 }, //識別碼
  expirationDate: { type: Date }, //截止時間
  isLocked: { type: Boolean, default: false }, //已鎖定
  history: { type: [HistorySchema], default: [] }, //歷史紀錄
  createdAt: { type: Date, default: Date.now }, //創建於
  updatedAt: { type: Date, default: Date.now }, //更新時間
});

export const CompetitionFormDB = mongoose.model<ICompetitionForm>(
  "CompetitionForm",
  CompetitionFormSchema
);
