import type { RequestHandler } from "express";

import {
  SESSION_COOKIE_NAME,
  isSessionIdleExpired,
} from "../auth/sessionConfig";
import { hashToken } from "../auth/sessionToken";
import { pool } from "../db/pool";
import { ApiError } from "../errors/apiError";
import { SessionRepository } from "../repositories/session.repository";

export const authenticateSession: RequestHandler = async (req, _res, next) => {
  const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

  if (typeof sessionToken !== "string" || sessionToken.trim() === "") {
    next(new ApiError(401, "unauthenticated", "尚未登入或 session 無效。"));
    return;
  }

  const session = await SessionRepository.findActiveSessionByTokenHash(
    pool,
    hashToken(sessionToken),
  );

  if (!session || isSessionIdleExpired(session.last_seen_at)) {
    next(new ApiError(401, "unauthenticated", "尚未登入或 session 無效。"));
    return;
  }

  await SessionRepository.touchSessionLastSeen(pool, session.id);

  req.auth = {
    sessionId: session.id,
    csrfTokenHash: session.csrf_token_hash,
    user: {
      id: session.user_id,
      displayName: session.user_display_name,
      email: session.user_email,
      role: session.user_role,
    },
  };

  req.user = {
    id: session.user_id,
    email: session.user_email,
    role: session.user_role,
  };

  next();
};
