import type { DatabaseClient } from "../db/types";
import type { ApplicationType } from "../domain/applicationTypes";
import type {
  AdminApplicationInstructionListQuery,
  CreateApplicationInstructionBody,
  UpdateApplicationInstructionBody,
} from "../schemas/applicationInstruction.schema";

export interface ApplicationInstructionRow {
  id: string;
  application_type: ApplicationType;
  section_key: string;
  title: string;
  content: string;
  display_order: number;
  is_visible: boolean;
  effective_from: string;
  effective_to: string | null;
  created_at: Date;
  updated_at: Date;
  has_started?: boolean;
}

const instructionColumns = `
  id::text, application_type, section_key, title, content,
  display_order, is_visible, effective_from, effective_to,
  created_at, updated_at
`;

function buildAdminFilters(input: AdminApplicationInstructionListQuery) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (input.applicationType) {
    params.push(input.applicationType);
    clauses.push(`application_type = $${params.length}`);
  }
  if (input.isVisible !== undefined) {
    params.push(input.isVisible);
    clauses.push(`is_visible = $${params.length}`);
  }
  if (!input.includeExpired) {
    clauses.push("(effective_to IS NULL OR effective_to > CURRENT_DATE)");
  }
  return {
    params,
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
  };
}

export async function listAdmin(
  client: DatabaseClient,
  input: AdminApplicationInstructionListQuery,
): Promise<{ items: ApplicationInstructionRow[]; totalItems: number }> {
  const { params, whereSql } = buildAdminFilters(input);
  const count = await client.query<{ total_items: string }>(
    `SELECT COUNT(*)::text AS total_items
     FROM application_instructions ${whereSql}`,
    params,
  );
  const offset = (input.page - 1) * input.pageSize;
  const rows = await client.query<ApplicationInstructionRow>(
    `SELECT ${instructionColumns}
     FROM application_instructions
     ${whereSql}
     ORDER BY effective_from DESC, display_order, id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, input.pageSize, offset],
  );
  return {
    items: rows.rows,
    totalItems: Number(count.rows[0].total_items),
  };
}

export async function listPublic(
  client: DatabaseClient,
  applicationType: ApplicationType,
  includeHistorical: boolean,
): Promise<ApplicationInstructionRow[]> {
  const result = await client.query<ApplicationInstructionRow>(
    `SELECT ${instructionColumns}
     FROM application_instructions
     WHERE application_type = $1
       AND is_visible = TRUE
       AND effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')::date
       ${
         includeHistorical
           ? ""
           : "AND (effective_to IS NULL OR effective_to > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')::date)"
       }
     ORDER BY effective_from DESC, display_order, id`,
    [applicationType],
  );
  return result.rows;
}

export async function closeOpenEndedVersion(
  client: DatabaseClient,
  input: CreateApplicationInstructionBody,
): Promise<void> {
  await client.query(
    `UPDATE application_instructions
     SET effective_to = $3
     WHERE application_type = $1
       AND section_key = $2
       AND effective_to IS NULL
       AND effective_from < $3`,
    [input.applicationType, input.sectionKey, input.effectiveFrom],
  );
}

export async function create(
  client: DatabaseClient,
  input: CreateApplicationInstructionBody,
): Promise<ApplicationInstructionRow> {
  const result = await client.query<ApplicationInstructionRow>(
    `INSERT INTO application_instructions
       (application_type, section_key, title, content, display_order,
        is_visible, effective_from, effective_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${instructionColumns}`,
    [
      input.applicationType,
      input.sectionKey,
      input.title,
      input.content,
      input.displayOrder,
      input.isVisible,
      input.effectiveFrom,
      input.effectiveTo,
    ],
  );
  return result.rows[0];
}

export async function findByIdForUpdate(
  client: DatabaseClient,
  instructionId: string,
): Promise<ApplicationInstructionRow | null> {
  const result = await client.query<ApplicationInstructionRow>(
    `SELECT ${instructionColumns},
       effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')::date AS has_started
     FROM application_instructions
     WHERE id = $1
     FOR UPDATE`,
    [instructionId],
  );
  return result.rows[0] ?? null;
}

const updateColumnMap = {
  applicationType: "application_type",
  sectionKey: "section_key",
  title: "title",
  content: "content",
  displayOrder: "display_order",
  effectiveFrom: "effective_from",
  effectiveTo: "effective_to",
} as const;

export async function update(
  client: DatabaseClient,
  instructionId: string,
  input: UpdateApplicationInstructionBody,
): Promise<ApplicationInstructionRow> {
  const entries = Object.entries(input) as Array<
    [keyof typeof updateColumnMap, unknown]
  >;
  const assignments = entries.map(
    ([key], index) => `${updateColumnMap[key]} = $${index + 2}`,
  );
  const result = await client.query<ApplicationInstructionRow>(
    `UPDATE application_instructions
     SET ${assignments.join(", ")}
     WHERE id = $1
     RETURNING ${instructionColumns}`,
    [instructionId, ...entries.map(([, value]) => value)],
  );
  return result.rows[0];
}

export async function setVisible(
  client: DatabaseClient,
  instructionId: string,
  isVisible: boolean,
): Promise<void> {
  await client.query(
    `UPDATE application_instructions SET is_visible = $2 WHERE id = $1`,
    [instructionId, isVisible],
  );
}

export const ApplicationInstructionRepository = {
  listAdmin,
  listPublic,
  closeOpenEndedVersion,
  create,
  findByIdForUpdate,
  update,
  setVisible,
};
