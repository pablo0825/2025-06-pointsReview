import type { ErrorRequestHandler } from "express";
import { isHttpError } from "http-errors";
import { ZodError } from "zod";

import { createInternalError, isApiError, ApiError } from "../errors/apiError";
import { createApiErrorFromPostgresError } from "../errors/postgresError";
import { createValidationApiError } from "../errors/zodError";

function createHttpApiError(error: unknown): ApiError | undefined {
  if (!isHttpError(error)) {
    return undefined;
  }

  if (error.statusCode === 404) {
    return new ApiError(404, "not_found", "資源不存在。");
  }

  return undefined;
}

function createLegacyApiError(error: unknown): ApiError | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const maybeStatusCode = (error as { statusCode?: unknown; status?: unknown })
    .statusCode;
  const maybeStatus = (error as { statusCode?: unknown; status?: unknown })
    .status;
  const statusCode =
    typeof maybeStatusCode === "number"
      ? maybeStatusCode
      : typeof maybeStatus === "number"
        ? maybeStatus
        : undefined;

  if (!statusCode || statusCode < 400 || statusCode >= 500) {
    return undefined;
  }

  return new ApiError(statusCode, "internal_error", error.message);
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const apiError =
    (isApiError(error) ? error : undefined) ??
    (error instanceof ZodError ? createValidationApiError(error) : undefined) ??
    createApiErrorFromPostgresError(error) ??
    createHttpApiError(error) ??
    createLegacyApiError(error) ??
    createInternalError();

  if (apiError.code === "internal_error") {
    console.error("Unexpected error", {
      method: req.method,
      path: req.originalUrl,
      errorName: getErrorName(error),
    });
  }

  res.status(apiError.statusCode).json(apiError.toResponse());
};
