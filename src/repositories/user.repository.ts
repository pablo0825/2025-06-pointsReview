import type { DatabaseClient } from "../db/types";

export type UserRole = "advisor" | "reviewer" | "admin";

export interface UserRow {
  id: string;
  display_name: string;
  email: string;
  password_hash: string | null;
  role: UserRole;
  is_active: boolean;
  activation_token_hash: Buffer | null;
  activation_token_expires_at: Date | null;
  activated_at: Date | null;
  password_reset_token_hash: Buffer | null;
  password_reset_token_expires_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Fixed internal SQL fragment. External values must be passed as query parameters.
const baseUserSelect = `
  SELECT
    id::text,
    display_name,
    email,
    password_hash,
    role,
    is_active,
    activation_token_hash,
    activation_token_expires_at,
    activated_at,
    password_reset_token_hash,
    password_reset_token_expires_at,
    last_login_at,
    created_at,
    updated_at
  FROM users
`;

export async function findById(
  client: DatabaseClient,
  userId: string,
): Promise<UserRow | null> {
  const result = await client.query<UserRow>(
    `${baseUserSelect}
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function findByEmail(
  client: DatabaseClient,
  email: string,
): Promise<UserRow | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await client.query<UserRow>(
    `${baseUserSelect}
     WHERE email = $1
     LIMIT 1`,
    [normalizedEmail],
  );

  return result.rows[0] ?? null;
}

export async function findByEmailForUpdate(
  client: DatabaseClient,
  email: string,
): Promise<UserRow | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await client.query<UserRow>(
    `${baseUserSelect}
     WHERE email = $1
     FOR UPDATE`,
    [normalizedEmail],
  );

  return result.rows[0] ?? null;
}

export async function findByActivationTokenHashForUpdate(
  client: DatabaseClient,
  tokenHash: Buffer,
): Promise<UserRow | null> {
  const result = await client.query<UserRow>(
    `${baseUserSelect}
     WHERE activation_token_hash = $1
     FOR UPDATE`,
    [tokenHash],
  );

  return result.rows[0] ?? null;
}

export async function findByPasswordResetTokenHashForUpdate(
  client: DatabaseClient,
  tokenHash: Buffer,
): Promise<UserRow | null> {
  const result = await client.query<UserRow>(
    `${baseUserSelect}
     WHERE password_reset_token_hash = $1
     FOR UPDATE`,
    [tokenHash],
  );

  return result.rows[0] ?? null;
}

export async function setActivationToken(
  client: DatabaseClient,
  userId: string,
  tokenHash: Buffer,
  expiresAt: Date,
): Promise<void> {
  await client.query(
    `UPDATE users
     SET activation_token_hash = $2, activation_token_expires_at = $3
     WHERE id = $1`,
    [userId, tokenHash, expiresAt],
  );
}

export async function setPasswordResetToken(
  client: DatabaseClient,
  userId: string,
  tokenHash: Buffer,
  expiresAt: Date,
): Promise<void> {
  await client.query(
    `UPDATE users
     SET password_reset_token_hash = $2, password_reset_token_expires_at = $3
     WHERE id = $1`,
    [userId, tokenHash, expiresAt],
  );
}

export async function lockActiveAdminDecision(
  client: DatabaseClient,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock($1)", [710043]);
}

export async function hasActiveAdmin(
  client: DatabaseClient,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM users WHERE role = 'admin' AND is_active = TRUE
     ) AS exists`,
  );
  return result.rows[0].exists;
}

export async function completeActivation(
  client: DatabaseClient,
  userId: string,
  passwordHash: string,
  isActive: boolean,
): Promise<void> {
  await client.query(
    `UPDATE users
     SET password_hash = $2,
         activated_at = NOW(),
         is_active = $3,
         activation_token_hash = NULL,
         activation_token_expires_at = NULL
     WHERE id = $1`,
    [userId, passwordHash, isActive],
  );
}

export async function completePasswordReset(
  client: DatabaseClient,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await client.query(
    `UPDATE users
     SET password_hash = $2,
         password_reset_token_hash = NULL,
         password_reset_token_expires_at = NULL
     WHERE id = $1`,
    [userId, passwordHash],
  );
}

export async function updateLastLoginAt(
  client: DatabaseClient,
  userId: string,
): Promise<UserRow | null> {
  const result = await client.query<UserRow>(
    `UPDATE users
     SET last_login_at = NOW()
     WHERE id = $1
     RETURNING
       id::text,
       display_name,
       email,
       password_hash,
       role,
       is_active,
       activation_token_hash,
       activation_token_expires_at,
       activated_at,
       password_reset_token_hash,
       password_reset_token_expires_at,
       last_login_at,
       created_at,
       updated_at`,
    [userId],
  );

  return result.rows[0] ?? null;
}

export const UserRepository = {
  findById,
  findByEmail,
  findByEmailForUpdate,
  findByActivationTokenHashForUpdate,
  findByPasswordResetTokenHashForUpdate,
  setActivationToken,
  setPasswordResetToken,
  lockActiveAdminDecision,
  hasActiveAdmin,
  completeActivation,
  completePasswordReset,
  updateLastLoginAt,
};
