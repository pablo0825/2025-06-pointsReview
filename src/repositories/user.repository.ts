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
  updateLastLoginAt,
};
