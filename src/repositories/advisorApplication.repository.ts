import type { DatabaseClient } from "../db/types";
import type { AdvisorHistoryListQuery } from "../schemas/advisorApplication.schema";

export interface AdvisorApplicationListRow {
  id: string;
  public_id: string;
  application_type: string;
  status: string;
  applicant_name: string;
  applicant_email: string;
  advisor_name: string;
  requested_total_points: string;
  approved_total_points: string | null;
  submitted_at: Date;
  advisor_confirmation_expires_at: Date;
  updated_at: Date;
}

export interface AdvisorApplicationDetailRow extends AdvisorApplicationListRow {
  applicant_phone: string;
  current_version_id: string;
  current_version_number: number;
  current_version_snapshot: Record<string, unknown>;
  current_version_created_at: Date;
}

export interface AdvisorParticipantRow {
  id: string;
  academic_year: string;
  grade: number;
  class_number: number;
  student_number: string;
  student_name: string;
  requested_points: string;
  approved_points: string | null;
  is_applicant: boolean;
}

export interface AdvisorAttachmentRow {
  public_id: string;
  application_version_id: string;
  attachment_type: string;
  attachment_type_other: string | null;
  description: string | null;
  original_filename: string;
  mime_type: string;
  file_size: string;
  created_at: Date;
}

export interface AdvisorVersionRow {
  id: string;
  version_number: number;
  application_snapshot: Record<string, unknown>;
  created_at: Date;
}

export interface AdvisorReviewActionRow {
  id: string;
  action_type: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface AdvisorSignatureRow {
  id: string;
  application_version_id: string;
  version_number: number;
  signed_at: Date;
  invalidated_at: Date | null;
  invalidated_reason: string | null;
  created_at: Date;
}

export interface LockedAdvisorApplicationRow {
  id: string;
  public_id: string;
  application_type: string;
  status: string;
  applicant_name: string;
  applicant_email: string;
  advisor_user_id: string;
  current_version_id: string;
  current_version_number: number;
  advisor_confirmation_expires_at: Date;
}

const listSelect = `
  SELECT
    pa.id::text,
    pa.public_id::text,
    pa.application_type,
    pa.status,
    pa.applicant_name,
    pa.applicant_email,
    a.name AS advisor_name,
    pa.requested_total_points,
    pa.approved_total_points,
    pa.submitted_at,
    pa.advisor_confirmation_expires_at,
    pa.updated_at
  FROM point_applications pa
  JOIN advisors a ON a.id = pa.advisor_id
`;

const detailSelect = `
  SELECT
    pa.id::text,
    pa.public_id::text,
    pa.application_type,
    pa.status,
    pa.applicant_name,
    pa.applicant_email,
    pa.applicant_phone,
    a.name AS advisor_name,
    pa.requested_total_points,
    pa.approved_total_points,
    pa.submitted_at,
    pa.advisor_confirmation_expires_at,
    pa.updated_at,
    av.id::text AS current_version_id,
    av.version_number AS current_version_number,
    av.application_snapshot AS current_version_snapshot,
    av.created_at AS current_version_created_at
  FROM point_applications pa
  JOIN advisors a ON a.id = pa.advisor_id
  JOIN application_versions av ON av.id = pa.current_version_id
`;

function pagination(input: { page: number; pageSize: number }) {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
}

export async function listPending(
  client: DatabaseClient,
  userId: string,
  input: { page: number; pageSize: number },
) {
  const count = await client.query<{ total_items: string }>(
    `SELECT COUNT(*)::text AS total_items
     FROM point_applications pa
     JOIN advisors a ON a.id = pa.advisor_id
     WHERE a.user_id = $1 AND pa.status = 'pending_advisor'`,
    [userId],
  );
  const { limit, offset } = pagination(input);
  const items = await client.query<AdvisorApplicationListRow>(
    `${listSelect}
     WHERE a.user_id = $1 AND pa.status = 'pending_advisor'
     ORDER BY pa.submitted_at DESC, pa.id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return { items: items.rows, totalItems: Number(count.rows[0].total_items) };
}

function historyFilters(userId: string, input: AdvisorHistoryListQuery) {
  const params: unknown[] = [userId];
  const clauses = ["a.user_id = $1", "pa.status <> 'pending_advisor'"];
  if (input.applicationType) {
    params.push(input.applicationType);
    clauses.push(`pa.application_type = $${params.length}`);
  }
  if (input.status) {
    params.push(input.status);
    clauses.push(`pa.status = $${params.length}`);
  }
  if (input.submittedFrom) {
    params.push(input.submittedFrom);
    clauses.push(`pa.submitted_at >= $${params.length}`);
  }
  if (input.submittedTo) {
    params.push(input.submittedTo);
    clauses.push(`pa.submitted_at <= $${params.length}`);
  }
  return { whereSql: `WHERE ${clauses.join(" AND ")}`, params };
}

export async function listHistory(
  client: DatabaseClient,
  userId: string,
  input: AdvisorHistoryListQuery,
) {
  const { whereSql, params } = historyFilters(userId, input);
  const count = await client.query<{ total_items: string }>(
    `SELECT COUNT(*)::text AS total_items
     FROM point_applications pa
     JOIN advisors a ON a.id = pa.advisor_id
     ${whereSql}`,
    params,
  );
  const { limit, offset } = pagination(input);
  const items = await client.query<AdvisorApplicationListRow>(
    `${listSelect}
     ${whereSql}
     ORDER BY pa.submitted_at DESC, pa.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return { items: items.rows, totalItems: Number(count.rows[0].total_items) };
}

export async function findDetail(
  client: DatabaseClient,
  userId: string,
  publicId: string,
  scope: "pending" | "history",
): Promise<AdvisorApplicationDetailRow | null> {
  const statusSql =
    scope === "pending"
      ? "pa.status = 'pending_advisor'"
      : "pa.status <> 'pending_advisor'";
  const result = await client.query<AdvisorApplicationDetailRow>(
    `${detailSelect}
     WHERE a.user_id = $1 AND pa.public_id = $2 AND ${statusSql}
     LIMIT 1`,
    [userId, publicId],
  );
  return result.rows[0] ?? null;
}

export async function listParticipants(
  client: DatabaseClient,
  applicationId: string,
) {
  const result = await client.query<AdvisorParticipantRow>(
    `SELECT id::text, academic_year, grade, class_number, student_number,
            student_name, requested_points, approved_points, is_applicant
     FROM application_participants
     WHERE application_id = $1
     ORDER BY id`,
    [applicationId],
  );
  return result.rows;
}

export async function listAttachments(
  client: DatabaseClient,
  applicationId: string,
  versionId?: string,
) {
  const result = await client.query<AdvisorAttachmentRow>(
    `SELECT public_id::text, application_version_id::text, attachment_type,
            attachment_type_other, description, original_filename, mime_type,
            file_size::text, created_at
     FROM application_attachments
     WHERE application_id = $1
       AND ($2::bigint IS NULL OR application_version_id = $2)
     ORDER BY created_at, id`,
    [applicationId, versionId ?? null],
  );
  return result.rows;
}

export async function listVersions(
  client: DatabaseClient,
  applicationId: string,
) {
  const result = await client.query<AdvisorVersionRow>(
    `SELECT id::text, version_number, application_snapshot, created_at
     FROM application_versions WHERE application_id = $1
     ORDER BY version_number`,
    [applicationId],
  );
  return result.rows;
}

export async function listAdvisorReviewActions(
  client: DatabaseClient,
  applicationId: string,
) {
  const result = await client.query<AdvisorReviewActionRow>(
    `SELECT id::text, action_type, reason, metadata, created_at
     FROM application_review_actions
     WHERE application_id = $1 AND actor_type = 'advisor'
     ORDER BY created_at, id`,
    [applicationId],
  );
  return result.rows;
}

export async function listAdvisorSignatures(
  client: DatabaseClient,
  applicationId: string,
) {
  const result = await client.query<AdvisorSignatureRow>(
    `SELECT s.id::text, s.application_version_id::text, v.version_number,
            s.signed_at, s.invalidated_at, s.invalidated_reason, s.created_at
     FROM advisor_signatures s
     JOIN application_versions v ON v.id = s.application_version_id
     WHERE v.application_id = $1
     ORDER BY s.signed_at, s.id`,
    [applicationId],
  );
  return result.rows;
}

export async function findForAdvisorAction(
  client: DatabaseClient,
  publicId: string,
): Promise<LockedAdvisorApplicationRow | null> {
  const result = await client.query<LockedAdvisorApplicationRow>(
    `SELECT pa.id::text, pa.public_id::text, pa.application_type, pa.status,
            pa.applicant_name, pa.applicant_email, a.user_id::text AS advisor_user_id,
            av.id::text AS current_version_id,
            av.version_number AS current_version_number,
            pa.advisor_confirmation_expires_at
     FROM point_applications pa
     JOIN advisors a ON a.id = pa.advisor_id
     JOIN application_versions av ON av.id = pa.current_version_id
     WHERE pa.public_id = $1
     FOR UPDATE OF pa`,
    [publicId],
  );
  return result.rows[0] ?? null;
}

export async function hasValidSignature(
  client: DatabaseClient,
  versionId: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM advisor_signatures
     WHERE application_version_id = $1 AND invalidated_at IS NULL
     LIMIT 1`,
    [versionId],
  );
  return result.rowCount === 1;
}

export async function createSignature(
  client: DatabaseClient,
  input: {
    versionId: string;
    advisorUserId: string;
    storageKey: string;
    signedAt: Date;
    ipAddress: string;
    userAgent: string;
  },
) {
  await client.query(
    `INSERT INTO advisor_signatures
       (application_version_id, advisor_user_id, signature_storage_key,
        signed_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.versionId,
      input.advisorUserId,
      input.storageKey,
      input.signedAt,
      input.ipAddress,
      input.userAgent,
    ],
  );
}

export async function createReviewAction(
  client: DatabaseClient,
  input: {
    applicationId: string;
    advisorUserId: string;
    actionType: "advisor_approved" | "advisor_rejected";
    reason?: string;
    versionNumber: number;
    ipAddress: string;
    userAgent: string;
  },
) {
  await client.query(
    `INSERT INTO application_review_actions
       (application_id, actor_user_id, actor_type, action_type, reason,
        metadata, ip_address, user_agent)
     VALUES ($1, $2, 'advisor', $3, $4, $5::jsonb, $6, $7)`,
    [
      input.applicationId,
      input.advisorUserId,
      input.actionType,
      input.reason ?? null,
      JSON.stringify({ versionNumber: input.versionNumber }),
      input.ipAddress,
      input.userAgent,
    ],
  );
}

export async function markUnderReview(
  client: DatabaseClient,
  applicationId: string,
) {
  await client.query(
    "UPDATE point_applications SET status = 'under_review' WHERE id = $1",
    [applicationId],
  );
}

export async function markRejected(
  client: DatabaseClient,
  applicationId: string,
  closedAt: Date,
) {
  await client.query(
    `UPDATE point_applications
     SET status = 'rejected', closed_at = $2
     WHERE id = $1`,
    [applicationId, closedAt],
  );
}

export const AdvisorApplicationRepository = {
  listPending,
  listHistory,
  findDetail,
  listParticipants,
  listAttachments,
  listVersions,
  listAdvisorReviewActions,
  listAdvisorSignatures,
  findForAdvisorAction,
  hasValidSignature,
  createSignature,
  createReviewAction,
  markUnderReview,
  markRejected,
};
