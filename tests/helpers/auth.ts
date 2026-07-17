import type { Response } from "supertest";

import type { Role } from "../../src/auth/permissions";
import { pool } from "../../src/db/pool";
import { assertSafeTestDatabaseUrl } from "./database";

interface CreateAuthTestUserInput {
  displayName?: string;
  email: string;
  passwordHash: string | null;
  role?: Role;
  isActive?: boolean;
  isActivated?: boolean;
}

export interface AuthTestUser {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}

export interface AuthTestSession {
  id: string;
  sessionTokenHash: Buffer;
  csrfTokenHash: Buffer;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

function assertUsingTestDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set for Auth integration tests");
  }

  assertSafeTestDatabaseUrl(databaseUrl);
}

export async function resetAuthTestData(): Promise<void> {
  assertUsingTestDatabase();
  await pool.query("DELETE FROM audit_logs");
  await pool.query("DELETE FROM user_sessions");
  await pool.query("DELETE FROM advisors");
  await pool.query("DELETE FROM users");
}

export async function createAuthTestUser(
  input: CreateAuthTestUserInput,
): Promise<AuthTestUser> {
  assertUsingTestDatabase();

  const displayName = input.displayName ?? "測試使用者";
  const role = input.role ?? "advisor";
  const result = await pool.query<{
    id: string;
    display_name: string;
    email: string;
    role: Role;
  }>(
    `
      INSERT INTO users (
        display_name,
        email,
        password_hash,
        role,
        is_active,
        activated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id::text, display_name, email, role
    `,
    [
      displayName,
      input.email.trim().toLowerCase(),
      input.passwordHash,
      role,
      input.isActive ?? true,
      input.isActivated === false ? null : new Date(),
    ],
  );
  const user = result.rows[0];

  return {
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
  };
}

export async function findAuthTestSession(
  userId: string,
): Promise<AuthTestSession> {
  assertUsingTestDatabase();

  const result = await pool.query<{
    id: string;
    session_token_hash: Buffer;
    csrf_token_hash: Buffer;
    last_seen_at: Date;
    expires_at: Date;
    revoked_at: Date | null;
    revoked_reason: string | null;
  }>(
    `
      SELECT
        id::text,
        session_token_hash,
        csrf_token_hash,
        last_seen_at,
        expires_at,
        revoked_at,
        revoked_reason
      FROM user_sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId],
  );
  const session = result.rows[0];

  if (!session) {
    throw new Error(`Session not found for Auth test user ${userId}`);
  }

  return {
    id: session.id,
    sessionTokenHash: session.session_token_hash,
    csrfTokenHash: session.csrf_token_hash,
    lastSeenAt: session.last_seen_at,
    expiresAt: session.expires_at,
    revokedAt: session.revoked_at,
    revokedReason: session.revoked_reason,
  };
}

export async function updateAuthTestSession(
  sessionId: string,
  changes: {
    lastSeenAt?: Date;
    createdAt?: Date;
    expiresAt?: Date;
    revokedAt?: Date;
    revokedReason?: string;
  },
): Promise<void> {
  assertUsingTestDatabase();

  await pool.query(
    `
      UPDATE user_sessions
      SET
        last_seen_at = COALESCE($2, last_seen_at),
        created_at = COALESCE($3, created_at),
        expires_at = COALESCE($4, expires_at),
        revoked_at = COALESCE($5, revoked_at),
        revoked_reason = COALESCE($6, revoked_reason)
      WHERE id = $1
    `,
    [
      sessionId,
      changes.lastSeenAt ?? null,
      changes.createdAt ?? null,
      changes.expiresAt ?? null,
      changes.revokedAt ?? null,
      changes.revokedReason ?? null,
    ],
  );
}

export function getResponseCookie(
  response: Response,
  cookieName: string,
): string {
  const setCookie = response.headers["set-cookie"] as unknown as
    | string[]
    | undefined;
  const cookie = setCookie?.find((value) => value.startsWith(`${cookieName}=`));

  if (!cookie) {
    throw new Error(`Response cookie ${cookieName} not found`);
  }

  return cookie;
}

export function getCookieValue(cookie: string): string {
  const pair = cookie.split(";", 1)[0];
  return decodeURIComponent(pair.slice(pair.indexOf("=") + 1));
}
