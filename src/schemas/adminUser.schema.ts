import { z } from "zod";

const positiveIntegerQuery = z.coerce.number().int().min(1);
const queryBoolean = z.enum(["true", "false"]).transform((value) => {
  return value === "true";
});

export const adminUserParamsSchema = z.object({
  userId: z.string().regex(/^\d+$/),
});

export const adminUserListQuerySchema = z.object({
  role: z.enum(["advisor", "reviewer", "admin"]).optional(),
  isActive: queryBoolean.optional(),
  keyword: z.string().trim().min(1).max(320).optional(),
  page: positiveIntegerQuery.default(1),
  pageSize: positiveIntegerQuery.max(100).default(20),
});

export const updateAdminUserBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(320).toLowerCase().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少需要提供一個可更新欄位。",
  });

export const adminUserEmptyBodySchema = z.object({}).strict().default({});

export const createAdminUserBodySchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320).toLowerCase(),
  role: z.enum(["admin", "reviewer"]),
});

export const transferAdminBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const deactivateAdminUserBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .default({});

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
export type CreateAdminUserBody = z.infer<typeof createAdminUserBodySchema>;
export type TransferAdminBody = z.infer<typeof transferAdminBodySchema>;
export type UpdateAdminUserBody = z.infer<typeof updateAdminUserBodySchema>;
export type DeactivateAdminUserBody = z.infer<
  typeof deactivateAdminUserBodySchema
>;
