import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";

import { createValidationApiError } from "../../src/errors/zodError";
import { validateRequest } from "../../src/middlewares/validateRequest.middleware";

describe("validateRequest middleware", () => {
  it("parses params, query, and body", () => {
    const middleware = validateRequest({
      params: z.object({ id: z.coerce.number() }),
      query: z.object({ page: z.coerce.number().default(1) }),
      body: z.object({ email: z.string().trim().toLowerCase().email() }),
    });
    const req = {
      params: { id: "123" },
      query: {},
      body: { email: " USER@EXAMPLE.COM " },
    };
    const next = () => undefined;

    middleware(req as never, {} as never, next);

    expect(req.params).toEqual({ id: 123 });
    expect(req.query).toEqual({ page: 1 });
    expect(req.body).toEqual({ email: "user@example.com" });
  });

  it("maps Zod errors to validation_failed response fields", () => {
    const error = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["participants", 0, "studentNumber"],
        message: "學號為必填欄位。",
      },
    ]);

    const apiError = createValidationApiError(error);

    expect(apiError.statusCode).toBe(422);
    expect(apiError.toResponse()).toEqual({
      code: "validation_failed",
      message: "輸入資料格式不正確。",
      fields: [
        {
          path: "participants.0.studentNumber",
          message: "學號為必填欄位。",
        },
      ],
    });
  });
});
