import type { CookieOptions, Response } from "express";

export const SESSION_COOKIE_NAME = "points_review_session";
export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

export function getSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_ABSOLUTE_TIMEOUT_MS,
  };
}

export function setSessionCookie(res: Response, sessionToken: string): void {
  res.cookie(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: getSessionCookieOptions().path,
    sameSite: getSessionCookieOptions().sameSite,
    secure: getSessionCookieOptions().secure,
  });
}

export function getSessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS);
}

export function isSessionIdleExpired(
  lastSeenAt: Date,
  now = new Date(),
): boolean {
  return now.getTime() - lastSeenAt.getTime() > SESSION_IDLE_TIMEOUT_MS;
}
