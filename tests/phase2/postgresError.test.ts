import { describe, expect, it } from "vitest";

import { createApiErrorFromPostgresError } from "../../src/errors/postgresError";

describe("PostgreSQL constraint error mapping", () => {
  it("maps known constraints to API errors", () => {
    const apiError = createApiErrorFromPostgresError({
      constraint: "users_email_unique",
    });

    expect(apiError?.statusCode).toBe(409);
    expect(apiError?.toResponse()).toEqual({
      code: "email_already_exists",
      message: "Email 已被使用。",
    });
  });

  it("returns undefined for unmapped constraints", () => {
    const apiError = createApiErrorFromPostgresError({
      constraint: "unknown_constraint",
    });

    expect(apiError).toBeUndefined();
  });
});
