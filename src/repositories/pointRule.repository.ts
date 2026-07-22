import type { DatabaseClient } from "../db/types";
import type { ApplicationType } from "../domain/applicationTypes";
import type { CreatePointRuleBody } from "../schemas/rule.schema";

export interface PointRuleRow extends Record<string, unknown> {
  id: string;
  effective_from: string;
  effective_to: string | null;
  created_at: Date;
  updated_at: Date;
}

const configs = {
  competition: {
    table: "competition_point_rules",
    keyColumns: ["competition_level", "award"],
    valueColumns: ["competition_level", "award", "allocation_method", "points"],
  },
  project_participation: {
    table: "project_point_rules",
    keyColumns: [],
    valueColumns: [
      "salary_unit",
      "points_per_unit",
      "rounding_method",
      "maximum_points",
    ],
  },
  certificate: {
    table: "certificate_point_rules",
    keyColumns: [],
    valueColumns: ["points_per_certificate", "maximum_points_per_student"],
  },
  external_exhibition: {
    table: "exhibition_point_rules",
    keyColumns: ["exhibition_type"],
    valueColumns: [
      "exhibition_type",
      "minimum_points_per_person",
      "maximum_points_per_person",
    ],
  },
} as const;

export async function list(
  client: DatabaseClient,
  applicationType: ApplicationType,
  includeExpired: boolean,
): Promise<PointRuleRow[]> {
  const { table, valueColumns } = configs[applicationType];
  const selectedValues = valueColumns
    .map((column) => `rules.${column}`)
    .join(", ");
  const result = await client.query<PointRuleRow>(
    `SELECT rules.id::text AS id, ${selectedValues},
            rules.effective_from, rules.effective_to,
            rules.created_at, rules.updated_at
     FROM ${table} rules
     ${includeExpired ? "" : "WHERE effective_to IS NULL OR effective_to > CURRENT_DATE"}
     ORDER BY rules.effective_from DESC, rules.id DESC`,
  );
  return result.rows;
}

function getRuleKey(input: CreatePointRuleBody): unknown[] {
  if (input.applicationType === "competition") {
    return [input.competitionLevel, input.award];
  }
  if (input.applicationType === "external_exhibition") {
    return [input.exhibitionType];
  }
  return [];
}

export async function closeOpenEndedVersion(
  client: DatabaseClient,
  input: CreatePointRuleBody,
): Promise<void> {
  const config = configs[input.applicationType];
  const key = getRuleKey(input);
  const clauses = config.keyColumns.map(
    (column, index) => `${column} = $${index + 2}`,
  );
  const keyWhere = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
  await client.query(
    `UPDATE ${config.table}
     SET effective_to = $1
     WHERE effective_to IS NULL
       AND effective_from < $1
       ${keyWhere}`,
    [input.effectiveFrom, ...key],
  );
}

export async function create(
  client: DatabaseClient,
  input: CreatePointRuleBody,
): Promise<PointRuleRow> {
  switch (input.applicationType) {
    case "competition": {
      const result = await client.query<PointRuleRow>(
        `INSERT INTO competition_point_rules
          (competition_level, award, allocation_method, points, effective_from, effective_to)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *, id::text`,
        [
          input.competitionLevel,
          input.award,
          input.allocationMethod,
          input.points,
          input.effectiveFrom,
          input.effectiveTo,
        ],
      );
      return result.rows[0];
    }
    case "project_participation": {
      const result = await client.query<PointRuleRow>(
        `INSERT INTO project_point_rules
          (salary_unit, points_per_unit, rounding_method, maximum_points, effective_from, effective_to)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *, id::text`,
        [
          input.salaryUnit,
          input.pointsPerUnit,
          input.roundingMethod,
          input.maximumPoints,
          input.effectiveFrom,
          input.effectiveTo,
        ],
      );
      return result.rows[0];
    }
    case "certificate": {
      const result = await client.query<PointRuleRow>(
        `INSERT INTO certificate_point_rules
          (points_per_certificate, maximum_points_per_student, effective_from, effective_to)
         VALUES ($1, $2, $3, $4)
         RETURNING *, id::text`,
        [
          input.pointsPerCertificate,
          input.maximumPointsPerStudent,
          input.effectiveFrom,
          input.effectiveTo,
        ],
      );
      return result.rows[0];
    }
    case "external_exhibition": {
      const result = await client.query<PointRuleRow>(
        `INSERT INTO exhibition_point_rules
          (exhibition_type, minimum_points_per_person, maximum_points_per_person, effective_from, effective_to)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *, id::text`,
        [
          input.exhibitionType,
          input.minimumPointsPerPerson,
          input.maximumPointsPerPerson,
          input.effectiveFrom,
          input.effectiveTo,
        ],
      );
      return result.rows[0];
    }
  }
}

export async function findByIdForUpdate(
  client: DatabaseClient,
  applicationType: ApplicationType,
  ruleId: string,
): Promise<PointRuleRow | null> {
  const { table } = configs[applicationType];
  const result = await client.query<PointRuleRow>(
    `SELECT *, id::text FROM ${table} WHERE id = $1 FOR UPDATE`,
    [ruleId],
  );
  return result.rows[0] ?? null;
}

export async function setEffectiveTo(
  client: DatabaseClient,
  applicationType: ApplicationType,
  ruleId: string,
  effectiveTo: string,
): Promise<void> {
  await client.query(
    `UPDATE ${configs[applicationType].table} SET effective_to = $2 WHERE id = $1`,
    [ruleId, effectiveTo],
  );
}

export const PointRuleRepository = {
  list,
  closeOpenEndedVersion,
  create,
  findByIdForUpdate,
  setEffectiveTo,
};
