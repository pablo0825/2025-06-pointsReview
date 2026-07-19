import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元。`)
  .max(PASSWORD_MAX_LENGTH, `密碼最多只能有 ${PASSWORD_MAX_LENGTH} 個字元。`);

