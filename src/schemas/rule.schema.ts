import { z } from "zod";

import { applicationTypes } from "../domain/applicationTypes";

const dateSchema = z.string().date();
const optionalEndDateSchema = dateSchema.nullable().default(null);
const positiveDecimalSchema = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0, "點數必須大於 0。");
const nonNegativeDecimalSchema = z.string().regex(/^\d+(?:\.\d{1,2})?$/);

const effectivePeriodFields = {
  effectiveFrom: dateSchema,
  effectiveTo: optionalEndDateSchema,
};

const competitionPointRuleSchema = z
  .object({
    applicationType: z.literal("competition"),
    competitionLevel: z.enum([
      "international_integrated",
      "international_non_integrated",
      "national_integrated",
      "national_non_integrated",
      "other",
    ]),
    award: z.enum([
      "first_place",
      "second_place",
      "third_place",
      "honorable_mention",
      "other_award",
      "finalist",
      "participation",
    ]),
    allocationMethod: z.enum(["per_person", "shared_total"]),
    points: positiveDecimalSchema,
    ...effectivePeriodFields,
  })
  .strict();

const projectPointRuleSchema = z
  .object({
    applicationType: z.literal("project_participation"),
    salaryUnit: z.number().int().positive(),
    pointsPerUnit: positiveDecimalSchema,
    roundingMethod: z.literal("floor"),
    maximumPoints: nonNegativeDecimalSchema.nullable().default(null),
    ...effectivePeriodFields,
  })
  .strict();

const certificatePointRuleSchema = z
  .object({
    applicationType: z.literal("certificate"),
    pointsPerCertificate: positiveDecimalSchema,
    maximumPointsPerStudent: positiveDecimalSchema,
    ...effectivePeriodFields,
  })
  .strict();

const exhibitionPointRuleSchema = z
  .object({
    applicationType: z.literal("external_exhibition"),
    exhibitionType: z.enum(["fan_work", "project_work"]),
    minimumPointsPerPerson: nonNegativeDecimalSchema,
    maximumPointsPerPerson: positiveDecimalSchema,
    ...effectivePeriodFields,
  })
  .strict();

export const createPointRuleBodySchema = z
  .discriminatedUnion("applicationType", [
    competitionPointRuleSchema,
    projectPointRuleSchema,
    certificatePointRuleSchema,
    exhibitionPointRuleSchema,
  ])
  .superRefine((value, context) => {
    if (
      value.effectiveTo !== null &&
      value.effectiveTo <= value.effectiveFrom
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "失效日期必須晚於生效日期。",
      });
    }
    if (
      value.applicationType === "external_exhibition" &&
      Number(value.maximumPointsPerPerson) <
        Number(value.minimumPointsPerPerson)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maximumPointsPerPerson"],
        message: "最高點數不可低於最低點數。",
      });
    }
  });

export const pointRuleListQuerySchema = z.object({
  applicationType: z.enum(applicationTypes),
  includeExpired: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default("false"),
});

export const pointRuleParamsSchema = z.object({
  applicationType: z.enum(applicationTypes),
  ruleId: z.string().regex(/^\d+$/),
});

export const deactivateRuleBodySchema = z.object({
  effectiveTo: dateSchema,
  reason: z.string().trim().min(1).max(500),
});

export const participantRuleListQuerySchema = z.object({
  applicationType: z.enum(applicationTypes).optional(),
  includeExpired: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default("false"),
});

export const createParticipantRuleBodySchema = z
  .object({
    applicationType: z.enum(applicationTypes),
    minimumParticipants: z.number().int().positive().max(50),
    maximumParticipants: z.number().int().positive().max(50),
    ...effectivePeriodFields,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.maximumParticipants < value.minimumParticipants) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maximumParticipants"],
        message: "最多人數不可小於最少人數。",
      });
    }
    if (
      value.effectiveTo !== null &&
      value.effectiveTo <= value.effectiveFrom
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "失效日期必須晚於生效日期。",
      });
    }
  });

export const participantRuleParamsSchema = z.object({
  ruleId: z.string().regex(/^\d+$/),
});

export type CreatePointRuleBody = z.infer<typeof createPointRuleBodySchema>;
export type PointRuleListQuery = z.infer<typeof pointRuleListQuerySchema>;
export type DeactivateRuleBody = z.infer<typeof deactivateRuleBodySchema>;
export type ParticipantRuleListQuery = z.infer<
  typeof participantRuleListQuerySchema
>;
export type CreateParticipantRuleBody = z.infer<
  typeof createParticipantRuleBodySchema
>;
