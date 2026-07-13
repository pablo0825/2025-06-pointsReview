import { ZodError } from "zod";

import { ApiError, type ValidationErrorField } from "./apiError";

function formatPath(path: (string | number)[]): string {
  return path.map(String).join(".");
}

export function createValidationApiError(error: ZodError): ApiError {
  const fields: ValidationErrorField[] = error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));

  return new ApiError(422, "validation_failed", "輸入資料格式不正確。", fields);
}
