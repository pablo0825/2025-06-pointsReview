import { z } from "zod";

import { applicationTypes } from "../domain/applicationTypes";

const paginationFields = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};

export const advisorApplicationParamsSchema = z.object({
  publicId: z.string().uuid(),
});

export const advisorPendingListQuerySchema = z.object(paginationFields);

export const advisorHistoryListQuerySchema = z
  .object({
    applicationType: z.enum(applicationTypes).optional(),
    status: z
      .enum(["under_review", "needs_revision", "approved", "rejected"])
      .optional(),
    submittedFrom: z.string().datetime({ offset: true }).optional(),
    submittedTo: z.string().datetime({ offset: true }).optional(),
    ...paginationFields,
  })
  .refine(
    (value) =>
      !value.submittedFrom ||
      !value.submittedTo ||
      Date.parse(value.submittedTo) >= Date.parse(value.submittedFrom),
    {
      path: ["submittedTo"],
      message: "結束時間不可早於開始時間。",
    },
  );

export const advisorApproveBodySchema = z
  .object({
    confirmVersionNumber: z.number().int().positive(),
  })
  .strict();

export const advisorRejectBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export type AdvisorPendingListQuery = z.infer<
  typeof advisorPendingListQuerySchema
>;
export type AdvisorHistoryListQuery = z.infer<
  typeof advisorHistoryListQuerySchema
>;
export type AdvisorApproveBody = z.infer<typeof advisorApproveBodySchema>;
export type AdvisorRejectBody = z.infer<typeof advisorRejectBodySchema>;
