import { ApiError, type ApiErrorCode } from "./apiError";

interface PostgresErrorLike {
  code?: string;
  constraint?: string;
}

export interface ConstraintErrorMapping {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
}

export type ConstraintErrorMappings = Record<string, ConstraintErrorMapping>;

const defaultConstraintMappings: ConstraintErrorMappings = {
  users_email_unique: {
    statusCode: 409,
    code: "email_already_exists",
    message: "Email 已被使用。",
  },
  one_active_admin: {
    statusCode: 409,
    code: "active_admin_required",
    message: "系統必須保留一位啟用中的管理員。",
  },
  one_active_director: {
    statusCode: 409,
    code: "active_director_conflict",
    message: "主任設定發生衝突。",
  },
  application_type_participant_rules_no_overlap: {
    statusCode: 409,
    code: "point_rule_period_overlap",
    message: "規則有效期間重疊。",
  },
  competition_point_rules_no_overlap: {
    statusCode: 409,
    code: "point_rule_period_overlap",
    message: "規則有效期間重疊。",
  },
  project_point_rules_no_overlap: {
    statusCode: 409,
    code: "point_rule_period_overlap",
    message: "規則有效期間重疊。",
  },
  certificate_point_rules_no_overlap: {
    statusCode: 409,
    code: "point_rule_period_overlap",
    message: "規則有效期間重疊。",
  },
  exhibition_point_rules_no_overlap: {
    statusCode: 409,
    code: "point_rule_period_overlap",
    message: "規則有效期間重疊。",
  },
};

function isPostgresErrorLike(error: unknown): error is PostgresErrorLike {
  return typeof error === "object" && error !== null && "code" in error;
}

export function createApiErrorFromPostgresError(
  error: unknown,
  mappings: ConstraintErrorMappings = {},
): ApiError | undefined {
  if (!isPostgresErrorLike(error) || !error.constraint) {
    return undefined;
  }

  const mapping =
    mappings[error.constraint] ?? defaultConstraintMappings[error.constraint];

  if (!mapping) {
    return undefined;
  }

  return new ApiError(mapping.statusCode, mapping.code, mapping.message);
}
