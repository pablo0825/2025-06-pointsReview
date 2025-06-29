// schemas/userCompetitionForm.schema.ts
import { z } from "zod";

export const studentSubmissionSchema = z.object({
  class: z.string().min(1),
  studentId: z.string().min(1),
  name: z.string().min(1),
  pointSubmitted: z.number().min(0),
});

export const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5),
});

export const competitionFormSchema = z.object({
  level: z.enum([
    "國際級整合",
    "國際級非整合",
    "全國性整合",
    "全國性非整合",
    "其他",
  ]),
  levelOther: z.string().optional(),
  name: z.string().min(1),
  group: z.string().optional(),
  award: z.enum(["第一名", "第二名", "第三名", "佳作", "入圍", "參賽", "其他"]),
  awardOther: z.string().optional(),
  date: z.coerce.date(), // 支援接收字串
  students: z.array(studentSubmissionSchema).min(1),
  evidenceFileUrl: z.string().url(),
  contact: contactSchema,
  advisor: z.string().min(1),
});

export const reviseNoteSchema = z.object({
  revisionNote: z.string().min(1),
});

export const rejectedReasonSchema = z.object({
  rejectedReason: z.string().min(1),
});
