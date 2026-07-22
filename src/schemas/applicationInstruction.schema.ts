import { z } from "zod";

import { applicationTypes } from "../domain/applicationTypes";

const dateSchema = z.string().date();
const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const instructionFields = {
  applicationType: z.enum(applicationTypes),
  sectionKey: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(20_000),
  displayOrder: z.number().int().min(0).max(32_767),
  effectiveFrom: dateSchema,
  effectiveTo: dateSchema.nullable().default(null),
};

function validatePeriod(
  value: { effectiveFrom: string; effectiveTo: string | null },
  context: z.RefinementCtx,
) {
  if (value.effectiveTo !== null && value.effectiveTo <= value.effectiveFrom) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "失效日期必須晚於生效日期。",
    });
  }
}

export const createApplicationInstructionBodySchema = z
  .object({
    ...instructionFields,
    isVisible: z.boolean().default(false),
  })
  .strict()
  .superRefine(validatePeriod);

export const updateApplicationInstructionBodySchema = z
  .object({
    applicationType: instructionFields.applicationType.optional(),
    sectionKey: instructionFields.sectionKey.optional(),
    title: instructionFields.title.optional(),
    content: instructionFields.content.optional(),
    displayOrder: instructionFields.displayOrder.optional(),
    effectiveFrom: instructionFields.effectiveFrom.optional(),
    effectiveTo: dateSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少需要提供一個要更新的欄位。",
  });

export const adminApplicationInstructionListQuerySchema = z.object({
  applicationType: z.enum(applicationTypes).optional(),
  isVisible: booleanQuerySchema.optional(),
  includeExpired: booleanQuerySchema.default("false"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const publicApplicationInstructionQuerySchema = z.object({
  applicationType: z.enum(applicationTypes),
  includeHistorical: booleanQuerySchema.default("false"),
});

export const applicationInstructionParamsSchema = z.object({
  instructionId: z.string().regex(/^\d+$/),
});

export const emptyInstructionActionBodySchema = z.object({}).strict();

export type CreateApplicationInstructionBody = z.infer<
  typeof createApplicationInstructionBodySchema
>;
export type UpdateApplicationInstructionBody = z.infer<
  typeof updateApplicationInstructionBodySchema
>;
export type AdminApplicationInstructionListQuery = z.infer<
  typeof adminApplicationInstructionListQuerySchema
>;
export type PublicApplicationInstructionQuery = z.infer<
  typeof publicApplicationInstructionQuerySchema
>;
