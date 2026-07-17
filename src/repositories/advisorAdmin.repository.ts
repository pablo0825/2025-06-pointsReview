import type { DatabaseClient } from "../db/types";

export interface AdminAdvisorRow {
  id: string;
  user_id: string;
  employee_number: string;
  name: string;
  title_code: number;
  department: string;
  is_active: boolean;
  is_director: boolean;
  created_at: Date;
  updated_at: Date;
  account_email: string;
  account_is_active: boolean;
  account_activated_at: Date | null;
}

export interface ListAdvisorsInput {
  keyword?: string;
  isActive?: boolean;
  isDirector?: boolean;
  page: number;
  pageSize: number;
}

export interface UpdateAdvisorInput {
  employeeNumber?: string;
  name?: string;
  titleCode?: number;
  department?: string;
}

const advisorSelect = `
  SELECT
    a.id::text,
    a.user_id::text,
    a.employee_number,
    a.name,
    a.title_code,
    a.department,
    a.is_active,
    a.is_director,
    a.created_at,
    a.updated_at,
    u.email AS account_email,
    u.is_active AS account_is_active,
    u.activated_at AS account_activated_at
  FROM advisors a
  JOIN users u ON u.id = a.user_id
`;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildAdvisorFilters(input: ListAdvisorsInput): {
  whereSql: string;
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (input.isActive !== undefined) {
    params.push(input.isActive);
    clauses.push(`a.is_active = $${params.length}`);
  }

  if (input.isDirector !== undefined) {
    params.push(input.isDirector);
    clauses.push(`a.is_director = $${params.length}`);
  }

  if (input.keyword !== undefined) {
    params.push(`%${escapeLikePattern(input.keyword)}%`);
    const placeholder = `$${params.length}`;
    clauses.push(
      `(a.name ILIKE ${placeholder} ESCAPE '\\' OR a.employee_number ILIKE ${placeholder} ESCAPE '\\' OR u.email ILIKE ${placeholder} ESCAPE '\\')`,
    );
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export async function list(
  client: DatabaseClient,
  input: ListAdvisorsInput,
): Promise<{ items: AdminAdvisorRow[]; totalItems: number }> {
  const { whereSql, params } = buildAdvisorFilters(input);
  const countResult = await client.query<{ total_items: string }>(
    `
      SELECT COUNT(*)::text AS total_items
      FROM advisors a
      JOIN users u ON u.id = a.user_id
      ${whereSql}
    `,
    params,
  );
  const offset = (input.page - 1) * input.pageSize;
  const itemsResult = await client.query<AdminAdvisorRow>(
    `${advisorSelect}
     ${whereSql}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    [...params, input.pageSize, offset],
  );

  return {
    items: itemsResult.rows,
    totalItems: Number(countResult.rows[0].total_items),
  };
}

export async function findById(
  client: DatabaseClient,
  advisorId: string,
): Promise<AdminAdvisorRow | null> {
  const result = await client.query<AdminAdvisorRow>(
    `${advisorSelect} WHERE a.id = $1 LIMIT 1`,
    [advisorId],
  );

  return result.rows[0] ?? null;
}

export async function findByIdForUpdate(
  client: DatabaseClient,
  advisorId: string,
): Promise<AdminAdvisorRow | null> {
  const result = await client.query<AdminAdvisorRow>(
    `${advisorSelect} WHERE a.id = $1 FOR UPDATE OF a`,
    [advisorId],
  );

  return result.rows[0] ?? null;
}

export async function findActiveDirectorForUpdate(
  client: DatabaseClient,
): Promise<AdminAdvisorRow | null> {
  const result = await client.query<AdminAdvisorRow>(
    `${advisorSelect}
     WHERE a.is_director = TRUE AND a.is_active = TRUE
     FOR UPDATE OF a`,
  );

  return result.rows[0] ?? null;
}

export async function update(
  client: DatabaseClient,
  advisorId: string,
  input: UpdateAdvisorInput,
): Promise<void> {
  await client.query(
    `
      UPDATE advisors
      SET
        employee_number = COALESCE($2, employee_number),
        name = COALESCE($3, name),
        title_code = COALESCE($4, title_code),
        department = COALESCE($5, department)
      WHERE id = $1
    `,
    [
      advisorId,
      input.employeeNumber ?? null,
      input.name ?? null,
      input.titleCode ?? null,
      input.department ?? null,
    ],
  );
}

export async function setActive(
  client: DatabaseClient,
  advisorId: string,
  isActive: boolean,
): Promise<void> {
  await client.query("UPDATE advisors SET is_active = $2 WHERE id = $1", [
    advisorId,
    isActive,
  ]);
}

export async function setDirector(
  client: DatabaseClient,
  advisorId: string,
  isDirector: boolean,
): Promise<void> {
  await client.query("UPDATE advisors SET is_director = $2 WHERE id = $1", [
    advisorId,
    isDirector,
  ]);
}

export const AdvisorAdminRepository = {
  list,
  findById,
  findByIdForUpdate,
  findActiveDirectorForUpdate,
  update,
  setActive,
  setDirector,
};
