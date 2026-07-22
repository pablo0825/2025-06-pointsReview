import { z } from "zod";

const dateSchema = z.string().date();
const positivePointsSchema = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0, "申請點數必須大於 0。");
const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const nullableOther = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable().optional().default(null);

const applicantSchema = z.object({
  name: text(100),
  email: z.string().trim().email().max(320).toLowerCase(),
  phone: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[0-9+()\- ]+$/, "電話格式不正確。"),
});

const participantSchema = z.object({
  academicYear: text(10),
  grade: z.number().int().min(1).max(6),
  classNumber: z.number().int().min(1).max(5),
  studentNumber: text(50),
  studentName: text(100),
  requestedPoints: positivePointsSchema,
  isApplicant: z.boolean(),
});

export const attachmentTypes = [
  "competition_rules",
  "competition_poster",
  "official_website_screenshot",
  "official_document",
  "participation_proof",
  "finalist_or_award_certificate",
  "salary_proof",
  "certificate_copy",
  "exhibition_photo",
  "exhibition_poster",
  "other",
] as const;

const attachmentSchema = z
  .object({
    clientFileKey: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/),
    attachmentType: z.enum(attachmentTypes),
    attachmentTypeOther: nullableOther(100),
    description: z.string().trim().max(500).nullable().optional().default(null),
  })
  .superRefine((value, context) => {
    const expectsOther = value.attachmentType === "other";
    if (expectsOther !== (value.attachmentTypeOther !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attachmentTypeOther"],
        message: expectsOther
          ? "選擇其他附件時必須填寫附件類型。"
          : "非其他附件不可填寫其他類型。",
      });
    }
  });

const commonFields = {
  advisorId: z.number().int().positive(),
  applicant: applicantSchema,
  participants: z.array(participantSchema).min(1).max(50),
  attachments: z.array(attachmentSchema).max(10),
};

const competitionDetailsSchema = z
  .object({
    competitionLevel: z.enum([
      "international_integrated",
      "international_non_integrated",
      "national_integrated",
      "national_non_integrated",
      "other",
    ]),
    competitionLevelOther: nullableOther(100),
    award: z.enum([
      "first_place",
      "second_place",
      "third_place",
      "honorable_mention",
      "other_award",
      "finalist",
      "participation",
    ]),
    awardOther: nullableOther(100),
    competitionName: text(255),
    competitionCategory: text(100),
    competitionDate: dateSchema,
  })
  .superRefine((value, context) => {
    validateOtherPair(
      value.competitionLevel === "other",
      value.competitionLevelOther,
      "competitionLevelOther",
      context,
    );
    validateOtherPair(
      value.award === "other_award",
      value.awardOther,
      "awardOther",
      context,
    );
  });

const projectDetailsSchema = z
  .object({
    projectName: text(255),
    principalInvestigator: text(100),
    workDescription: text(20_000),
    salaryItems: z
      .array(
        z.object({
          salaryMonth: dateSchema.refine(
            (value) => value.endsWith("-01"),
            "薪資月份必須使用該月第一天。",
          ),
          salaryAmount: z
            .number()
            .int()
            .positive()
            .max(Number.MAX_SAFE_INTEGER),
        }),
      )
      .min(1)
      .max(120),
  })
  .superRefine((value, context) => {
    validateUnique(
      value.salaryItems.map((item) => item.salaryMonth),
      "salaryItems",
      "salaryMonth",
      "薪資月份不可重複。",
      context,
    );
  });

const certificateDetailsSchema = z.object({
  certificateName: text(255),
  certificateIssuer: text(255),
  certificateNumber: text(100),
  certificateDate: dateSchema,
});

const exhibitionDetailsSchema = z
  .object({
    exhibitionType: z.enum(["fan_work", "project_work"]),
    workName: text(255),
    exhibitionName: z.enum([
      "campus_exhibition",
      "young_designers_exhibition",
      "vision_get_wild",
      "young_designers_exhibition_taiwan",
      "a_plus_creative_festival",
      "moe_project_competition",
      "other",
    ]),
    exhibitionNameOther: nullableOther(255),
    organizer: text(255),
    venue: text(255),
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .superRefine((value, context) => {
    validateOtherPair(
      value.exhibitionName === "other",
      value.exhibitionNameOther,
      "exhibitionNameOther",
      context,
    );
    if (value.endDate < value.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "展覽結束日不可早於開始日。",
      });
    }
  });

function validateOtherPair(
  expectsOther: boolean,
  otherValue: string | null,
  path: string,
  context: z.RefinementCtx,
) {
  if (expectsOther !== (otherValue !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: expectsOther ? "此欄位為必填。" : "此欄位必須為 null。",
    });
  }
}

function validateUnique(
  values: string[],
  arrayPath: string,
  fieldPath: string,
  message: string,
  context: z.RefinementCtx,
) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [arrayPath, index, fieldPath],
        message,
      });
    }
    seen.add(value);
  });
}

const applicationBranches = [
  z.object({
    applicationType: z.literal("competition"),
    ...commonFields,
    typeDetails: competitionDetailsSchema,
  }),
  z.object({
    applicationType: z.literal("project_participation"),
    ...commonFields,
    typeDetails: projectDetailsSchema,
  }),
  z.object({
    applicationType: z.literal("certificate"),
    ...commonFields,
    typeDetails: certificateDetailsSchema,
  }),
  z.object({
    applicationType: z.literal("external_exhibition"),
    ...commonFields,
    typeDetails: exhibitionDetailsSchema,
  }),
] as const;

export const createApplicationSubmissionSchema = z
  .discriminatedUnion("applicationType", applicationBranches)
  .superRefine((value, context) => {
    const applicantIndexes = value.participants
      .map((participant, index) => (participant.isApplicant ? index : -1))
      .filter((index) => index >= 0);
    if (applicantIndexes.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participants"],
        message: "參與者中必須剛好有一位申請人。",
      });
    } else if (
      value.participants[applicantIndexes[0]].studentName !==
      value.applicant.name
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participants", applicantIndexes[0], "studentName"],
        message: "申請人的學生姓名必須與聯絡人姓名一致。",
      });
    }
    validateUnique(
      value.participants.map((participant) => participant.studentNumber),
      "participants",
      "studentNumber",
      "學號不可重複。",
      context,
    );
    validateUnique(
      value.attachments.map((attachment) => attachment.clientFileKey),
      "attachments",
      "clientFileKey",
      "附件識別值不可重複。",
      context,
    );
  });

export type CreateApplicationSubmission = z.infer<
  typeof createApplicationSubmissionSchema
>;
export type SubmissionParticipant =
  CreateApplicationSubmission["participants"][number];
