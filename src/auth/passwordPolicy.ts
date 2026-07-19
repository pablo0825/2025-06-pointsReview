import { ApiError } from "../errors/apiError";

const commonWeakPasswords = new Set([
  "123456789012",
  "administrator",
  "letmein123456",
  "password123",
  "password1234",
  "qwerty123456",
  "welcome12345",
]);

function createPasswordPolicyError(message: string): ApiError {
  return new ApiError(422, "validation_failed", message, [
    { path: "password", message },
  ]);
}

export function assertPasswordPolicy(password: string, email: string): void {
  const normalizedPassword = password.toLocaleLowerCase("en-US");
  const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
  const emailLocalPart = normalizedEmail.split("@", 1)[0];

  if (commonWeakPasswords.has(normalizedPassword)) {
    throw createPasswordPolicyError("密碼過於常見，請使用其他密碼。");
  }

  if (emailLocalPart && normalizedPassword === emailLocalPart) {
    throw createPasswordPolicyError("密碼不可與 Email 帳號部分相同。");
  }
}

export const PasswordPolicy = { assert: assertPasswordPolicy };

