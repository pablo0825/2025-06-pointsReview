import type { RequestHandler } from "express";

import { timingSafeEqualTokenHash } from "../auth/sessionToken";
import { ApiError } from "../errors/apiError";

const CSRF_HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const csrfToken = req.get(CSRF_HEADER_NAME);
  const expectedHash = req.auth?.csrfTokenHash;

  if (!expectedHash || !csrfToken) {
    next(new ApiError(403, "csrf_token_invalid", "CSRF token 無效。"));
    return;
  }

  if (!timingSafeEqualTokenHash(expectedHash, csrfToken)) {
    next(new ApiError(403, "csrf_token_invalid", "CSRF token 無效。"));
    return;
  }

  next();
};
