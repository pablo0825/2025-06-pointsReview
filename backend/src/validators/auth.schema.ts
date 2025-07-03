import { z } from "zod";

export const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  email: z.string().min(6),
});

export const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const userDataSchema = z.object({
  username: z.string().min(3),
  email: z.string().min(6),
  newPassword: z.string().min(6).optional(),
});
