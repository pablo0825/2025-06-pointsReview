import { Document } from "mongoose";

export interface IStudent {
  class: string;
  studentId: string;
  name: string;
  pointSubmitted: number;
  //pointApproved?: number;
  //pointComment?: string;
  //approvedBy?: string;
  //approvedAt?: Date;
}

export interface IContact {
  name: string;
  email: string;
  phone: string;
}

export interface IHistory {
  type: "created" | "updated" | "status_changed" | "note_added";
  timestamp: Date;
  user: string;
  detail?: string;
}

export interface IAdvisor {
  name: string;
  email: string;
  isAgreed?: boolean;
  teacherConfirmToken?: string | undefined;
  teacherConfirmExpires?: Date | undefined;
}

export interface ICompetitionForm extends Document {
  level: string;
  levelOther?: string;
  name: string;
  group?: string;
  award: string;
  awardOther?: string;
  date: Date;
  students: IStudent[];
  evidenceFileUrls: string[];
  contact: IContact;
  advisor: IAdvisor;
  totalPoints: number;
  status:
    | "submitted"
    | "needs_revision"
    | "resubmitted"
    | "approved"
    | "rejected"
    | "expired";
  revisionNote?: string;
  rejectedReason?: string;
  editToken: string;
  expirationDate: Date;
  isLocked?: boolean;
  history: IHistory[];
  createdAt?: Date;
  updatedAt?: Date;
}
