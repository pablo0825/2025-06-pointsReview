import type { Role } from "../auth/permissions";
import type { DatabaseClient } from "../db/types";

export interface AdminUserRow {
  id: string;
  display_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  password_hash: string | null;
  activated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ListUsersInput {
  role?: Role;
  isActive?: boolean;
  keyword?: string;
  page: number;
  pageSize: number;
}

export interface UpdateUserInput {
  displayName?: string;
  email?: string;
}

const userSelect = `
  SELECT
    id::text,
    display_name,
    email,
    role,
    is_active,
    password_hash,
    activated_at,
    created_at,
    updated_at
  FROM users
`;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildUserFilters(input: ListUsersInput): {
  whereSql: string;
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (input.role !== undefined) {
    params.push(input.role);
    clauses.push(`role = $${params.length}`);
  }

  if (input.isActive !== undefined) {
    params.push(input.isActive);
    clauses.push(`is_active = $${params.length}`);
  }

  if (input.keyword !== undefined) {
    params.push(`%${escapeLikePattern(input.keyword)}%`);
    clauses.push(
      `(display_name ILIKE $${params.length} ESCAPE '\\' OR email ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export async function list(
  client: DatabaseClient,
  input: ListUsersInput,
): Promise<{ items: AdminUserRow[]; totalItems: number }> {
  const { whereSql, params } = buildUserFilters(input);
  const countResult = await client.query<{ total_items: string }>(
    `SELECT COUNT(*)::text AS total_items FROM users ${whereSql}`,
    params,
  );
  const offset = (input.page - 1) * input.pageSize;
  const pageParams = [...params, input.pageSize, offset];
  const itemsResult = await client.query<AdminUserRow>(
    `${userSelect}
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    pageParams,
  );

  return {
    items: itemsResult.rows,
    totalItems: Number(countResult.rows[0].total_items),
  };
}

export async function findById(
  client: DatabaseClient,
  userId: string,
): Promise<AdminUserRow | null> {
  const result = await client.query<AdminUserRow>(
    `${userSelect} WHERE id = $1 LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function findByIdForUpdate(
  client: DatabaseClient,
  userId: string,
): Promise<AdminUserRow | null> {
  const result = await client.query<AdminUserRow>(
    `${userSelect} WHERE id = $1 FOR UPDATE`,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function update(
  client: DatabaseClient,
  userId: string,
  input: UpdateUserInput,
): Promise<AdminUserRow> {
  const result = await client.query<AdminUserRow>(
    `
      UPDATE users
      SET
        display_name = COALESCE($2, display_name),
        email = COALESCE($3, email)
      WHERE id = $1
      RETURNING
        id::text,
        display_name,
        email,
        role,
        is_active,
        password_hash,
        activated_at,
        created_at,
        updated_at
    `,
    [userId, input.displayName ?? null, input.email ?? null],
  );

  return result.rows[0];
}

export async function setActive(
  client: DatabaseClient,
  userId: string,
  isActive: boolean,
): Promise<AdminUserRow> {
  const result = await client.query<AdminUserRow>(
    `
      UPDATE users
      SET is_active = $2
      WHERE id = $1
      RETURNING
        id::text,
        display_name,
        email,
        role,
        is_active,
        password_hash,
        activated_at,
        created_at,
        updated_at
    `,
    [userId, isActive],
  );

  return result.rows[0];
}

export const UserAdminRepository = {
  list,
  findById,
  findByIdForUpdate,
  update,
  setActive,
};
