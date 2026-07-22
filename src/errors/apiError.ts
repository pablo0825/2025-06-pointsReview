export type ApiErrorCode =
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "csrf_token_invalid"
  | "not_found"
  | "rate_limited"
  | "application_status_conflict"
  | "application_version_conflict"
  | "advisor_confirmation_expired"
  | "revision_token_invalid"
  | "account_token_invalid"
  | "point_change_request_status_conflict"
  | "point_rule_period_overlap"
  | "participant_rule_period_overlap"
  | "application_instruction_period_overlap"
  | "application_instruction_already_effective"
  | "certificate_points_limit_exceeded"
  | "file_type_not_allowed"
  | "file_too_large"
  | "too_many_files"
  | "file_missing"
  | "email_already_exists"
  | "account_state_conflict"
  | "active_admin_required"
  | "active_director_conflict"
  | "employee_number_already_exists"
  | "advisor_state_conflict"
  | "active_director_required"
  | "internal_error";

export interface ValidationErrorField {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  code: ApiErrorCode;
  message: string;
  fields?: ValidationErrorField[];
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly fields?: ValidationErrorField[];
  readonly isOperational = true;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    fields?: ValidationErrorField[],
  ) {
    super(message);

    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
  }

  toResponse(): ApiErrorResponse {
    return {
      code: this.code,
      message: this.message,
      ...(this.fields ? { fields: this.fields } : {}),
    };
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function createInternalError(): ApiError {
  return new ApiError(500, "internal_error", "系統發生未預期錯誤。");
}
