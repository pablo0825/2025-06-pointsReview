import type { DatabaseClient } from "../db/types";
import type { ApplicationType } from "../domain/applicationTypes";
import type { CreateParticipantRuleBody } from "../schemas/rule.schema";

export interface ParticipantRuleRow {
  id: string;
  application_type: ApplicationType;
  minimum_participants: number;
  maximum_participants: number;
  effective_from: string;
  effective_to: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function list(
  client: DatabaseClient,
  applicationType: ApplicationType | undefined,
  includeExpired: boolean,
): Promise<ParticipantRuleRow[]> {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (applicationType) {
    params.push(applicationType);
    clauses.push(`application_type = $${params.length}`);
  }
  if (!includeExpired) {
    clauses.push("(effective_to IS NULL OR effective_to > CURRENT_DATE)");
  }

  const result = await client.query<ParticipantRuleRow>(
    `SELECT id::text, application_type, minimum_participants,
            maximum_participants, effective_from, effective_to,
            created_at, updated_at
     FROM application_type_participant_rules
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY application_type, effective_from DESC, id DESC`,
    params,
  );
  return result.rows;
}

export async function closeOpenEndedVersion(
  client: DatabaseClient,
  input: CreateParticipantRuleBody,
): Promise<void> {
  await client.query(
    `UPDATE application_type_participant_rules
     SET effective_to = $2
     WHERE application_type = $1
       AND effective_to IS NULL
       AND effective_from < $2`,
    [input.applicationType, input.effectiveFrom],
  );
}

export async function create(
  client: DatabaseClient,
  input: CreateParticipantRuleBody,
): Promise<ParticipantRuleRow> {
  const result = await client.query<ParticipantRuleRow>(
    `INSERT INTO application_type_participant_rules
       (application_type, minimum_participants, maximum_participants,
        effective_from, effective_to)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id::text, application_type, minimum_participants,
       maximum_participants, effective_from, effective_to,
       created_at, updated_at`,
    [
      input.applicationType,
      input.minimumParticipants,
      input.maximumParticipants,
      input.effectiveFrom,
      input.effectiveTo,
    ],
  );
  return result.rows[0];
}

export async function findByIdForUpdate(
  client: DatabaseClient,
  ruleId: string,
): Promise<ParticipantRuleRow | null> {
  const result = await client.query<ParticipantRuleRow>(
    `SELECT id::text, application_type, minimum_participants,
            maximum_participants, effective_from, effective_to,
            created_at, updated_at
     FROM application_type_participant_rules
     WHERE id = $1
     FOR UPDATE`,
    [ruleId],
  );
  return result.rows[0] ?? null;
}

export async function setEffectiveTo(
  client: DatabaseClient,
  ruleId: string,
  effectiveTo: string,
): Promise<void> {
  await client.query(
    `UPDATE application_type_participant_rules
     SET effective_to = $2
     WHERE id = $1`,
    [ruleId, effectiveTo],
  );
}

export const ParticipantRuleRepository = {
  list,
  closeOpenEndedVersion,
  create,
  findByIdForUpdate,
  setEffectiveTo,
};
