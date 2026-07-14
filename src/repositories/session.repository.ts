import type { DatabaseClient } from "../db/types";

export type SessionRevocationReason =
  | "logout"
  | "account_deactivated"
  | "password_reset"
  | "role_changed"
  | "admin_transferred"
  | "admin_recovered";

export interface SessionRow {
  id: string;
  session_token_hash: Buffer;
  csrf_token_hash: Buffer;
  user_id: string;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
  ip_address: string;
  user_agent: string;
  created_at: Date;
  updated_at: Date;
}

export interface ActiveSessionRow extends SessionRow {
  user_display_name: string;
  user_email: string;
  user_role: "advisor" | "reviewer" | "admin";
  user_is_active: boolean;
  user_activated_at: Date | null;
}

export interface CreateSessionInput {
  sessionTokenHash: Buffer;
  csrfTokenHash: Buffer;
  userId: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
}

const baseSessionSelect = `
  SELECT
    id::text,
    session_token_hash,
    csrf_token_hash,
    user_id::text,
    last_seen_at,
    expires_at,
    revoked_at,
    revoked_reason,
    ip_address::text,
    user_agent,
    created_at,
    updated_at
  FROM user_sessions
`;

const baseActiveSessionSelect = `
  SELECT
    s.id::text,
    s.session_token_hash,
    s.csrf_token_hash,
    s.user_id::text,
    s.last_seen_at,
    s.expires_at,
    s.revoked_at,
    s.revoked_reason,
    s.ip_address::text,
    s.user_agent,
    s.created_at,
    s.updated_at,
    u.display_name AS user_display_name,
    u.email AS user_email,
    u.role AS user_role,
    u.is_active AS user_is_active,
    u.activated_at AS user_activated_at
  FROM user_sessions s
  JOIN users u ON u.id = s.user_id
`;

// 建立一筆新的使用者 session，保存 session / CSRF token hash 與登入環境資訊。
export async function createSession(
  client: DatabaseClient,
  input: CreateSessionInput,
): Promise<SessionRow> {
  const result = await client.query<SessionRow>(
    `
      INSERT INTO user_sessions (
        session_token_hash,
        csrf_token_hash,
        user_id,
        expires_at,
        ip_address,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id::text,
        session_token_hash,
        csrf_token_hash,
        user_id::text,
        last_seen_at,
        expires_at,
        revoked_at,
        revoked_reason,
        ip_address::text,
        user_agent,
        created_at,
        updated_at
    `,
    [
      input.sessionTokenHash,
      input.csrfTokenHash,
      input.userId,
      input.expiresAt,
      input.ipAddress,
      input.userAgent,
    ],
  );

  return result.rows[0];
}

// 依 session token hash 查詢目前仍有效、未撤銷且使用者仍啟用的 session。
export async function findActiveSessionByTokenHash(
  client: DatabaseClient,
  sessionTokenHash: Buffer,
): Promise<ActiveSessionRow | null> {
  const result = await client.query<ActiveSessionRow>(
    `${baseActiveSessionSelect}
     WHERE s.session_token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND u.is_active = TRUE
       AND u.activated_at IS NOT NULL
     LIMIT 1`,
    [sessionTokenHash],
  );

  return result.rows[0] ?? null;
}

// 依 session id 查詢單筆 session，不限制是否已過期或撤銷。
export async function findById(
  client: DatabaseClient,
  sessionId: string,
): Promise<SessionRow | null> {
  const result = await client.query<SessionRow>(
    `${baseSessionSelect}
     WHERE id = $1
     LIMIT 1`,
    [sessionId],
  );

  return result.rows[0] ?? null;
}

// 更新有效 session 的 last_seen_at，用來記錄最近一次使用時間。
export async function touchSessionLastSeen(
  client: DatabaseClient,
  sessionId: string,
): Promise<SessionRow | null> {
  const result = await client.query<SessionRow>(
    `
      UPDATE user_sessions
      SET last_seen_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      RETURNING
        id::text,
        session_token_hash,
        csrf_token_hash,
        user_id::text,
        last_seen_at,
        expires_at,
        revoked_at,
        revoked_reason,
        ip_address::text,
        user_agent,
        created_at,
        updated_at
    `,
    [sessionId],
  );

  return result.rows[0] ?? null;
}

// 撤銷單一 session，例如使用者登出目前裝置。
export async function revokeSession(
  client: DatabaseClient,
  sessionId: string,
  reason: SessionRevocationReason,
): Promise<SessionRow | null> {
  const result = await client.query<SessionRow>(
    `
      UPDATE user_sessions
      SET
        revoked_at = NOW(),
        revoked_reason = $2
      WHERE id = $1
        AND revoked_at IS NULL
      RETURNING
        id::text,
        session_token_hash,
        csrf_token_hash,
        user_id::text,
        last_seen_at,
        expires_at,
        revoked_at,
        revoked_reason,
        ip_address::text,
        user_agent,
        created_at,
        updated_at
    `,
    [sessionId, reason],
  );

  return result.rows[0] ?? null;
}

// 撤銷某個使用者所有尚未撤銷的 session，例如帳號停用或密碼重設。
export async function revokeUserSessions(
  client: DatabaseClient,
  userId: string,
  reason: SessionRevocationReason,
): Promise<number> {
  const result = await client.query(
    `
      UPDATE user_sessions
      SET
        revoked_at = NOW(),
        revoked_reason = $2
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId, reason],
  );

  return result.rowCount ?? 0;
}

// 更新有效 session 綁定的 CSRF token hash，原始 CSRF token 不寫入資料庫。
export async function updateCsrfTokenHash(
  client: DatabaseClient,
  sessionId: string,
  csrfTokenHash: Buffer,
): Promise<SessionRow | null> {
  const result = await client.query<SessionRow>(
    `
      UPDATE user_sessions
      SET csrf_token_hash = $2
      WHERE id = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      RETURNING
        id::text,
        session_token_hash,
        csrf_token_hash,
        user_id::text,
        last_seen_at,
        expires_at,
        revoked_at,
        revoked_reason,
        ip_address::text,
        user_agent,
        created_at,
        updated_at
    `,
    [sessionId, csrfTokenHash],
  );

  return result.rows[0] ?? null;
}

export const SessionRepository = {
  createSession,
  findActiveSessionByTokenHash,
  findById,
  touchSessionLastSeen,
  revokeSession,
  revokeUserSessions,
  updateCsrfTokenHash,
};
