import type { CookieOptions, Response } from "express";

// 瀏覽器保存 session token 的 cookie 名稱。
export const SESSION_COOKIE_NAME = "points_review_session";

// 使用者閒置超過此時間後，session 視為失效。
export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

// session 從建立起算的最長有效時間，不會因持續操作而延長。
export const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

// 集中定義 session cookie 的安全選項，避免設定散落在登入與登出流程。
export function getSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_ABSOLUTE_TIMEOUT_MS,
  };
}

// 登入成功後設定 HttpOnly session cookie，cookie 值為原始 session token。
export function setSessionCookie(res: Response, sessionToken: string): void {
  res.cookie(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
}

// 登出或 session 失效時清除瀏覽器端 session cookie。
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: getSessionCookieOptions().path,
    sameSite: getSessionCookieOptions().sameSite,
    secure: getSessionCookieOptions().secure,
  });
}

// 計算 session 寫入資料庫時的絕對過期時間。
export function getSessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS);
}

// 判斷 session 是否因 last_seen_at 太久未更新而閒置過期。
export function isSessionIdleExpired(
  lastSeenAt: Date,
  now = new Date(),
): boolean {
  return now.getTime() - lastSeenAt.getTime() > SESSION_IDLE_TIMEOUT_MS;
}
