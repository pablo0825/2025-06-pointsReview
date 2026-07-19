import { z } from "zod";

import { passwordSchema } from "./password.schema";

export const loginRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const accountTokenParamsSchema = z.object({
  token: z.string().min(1).max(200),
});

export const accountPasswordBodySchema = z.object({
  password: passwordSchema,
});

export const passwordResetRequestBodySchema = z.object({
  email: z.string().trim().email().max(320).toLowerCase(),
});
