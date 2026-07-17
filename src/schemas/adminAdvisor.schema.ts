import { z } from "zod";

const positiveIntegerQuery = z.coerce.number().int().min(1);
const queryBoolean = z.enum(["true", "false"]).transform((value) => {
  return value === "true";
});

export const adminAdvisorParamsSchema = z.object({
  advisorId: z.string().regex(/^\d+$/),
});

export const adminAdvisorListQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(320).optional(),
  isActive: queryBoolean.optional(),
  isDirector: queryBoolean.optional(),
  page: positiveIntegerQuery.default(1),
  pageSize: positiveIntegerQuery.max(100).default(20),
});

export const updateAdminAdvisorBodySchema = z
  .object({
    employeeNumber: z.string().trim().min(1).max(50).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    titleCode: z.number().int().min(1).max(7).optional(),
    department: z.string().trim().min(1).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少需要提供一個可更新欄位。",
  });

export const adminAdvisorEmptyBodySchema = z.object({}).strict().default({});

export const advisorActionBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .default({});

export type AdminAdvisorListQuery = z.infer<typeof adminAdvisorListQuerySchema>;
export type UpdateAdminAdvisorBody = z.infer<
  typeof updateAdminAdvisorBodySchema
>;
export type AdvisorActionBody = z.infer<typeof advisorActionBodySchema>;
