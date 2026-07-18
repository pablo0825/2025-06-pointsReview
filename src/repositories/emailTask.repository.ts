import type { DatabaseClient } from "../db/types";

export type EmailTaskStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled";

export interface EmailTaskRow {
  id: string;
  event_key: string;
  application_id: string | null;
  recipient_email: string;
  template_name: string;
  payload: Record<string, unknown>;
  status: EmailTaskStatus;
  scheduled_at: Date;
  sent_at: Date | null;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePendingEmailTaskInput {
  eventKey: string;
  applicationId?: string | null;
  recipientEmail: string;
  templateName: string;
  payload: Record<string, unknown>;
  scheduledAt: Date;
  maxAttempts: number;
}

const emailTaskColumns = `
  id::text,
  event_key,
  application_id::text,
  recipient_email,
  template_name,
  payload,
  status,
  scheduled_at,
  sent_at,
  attempt_count,
  max_attempts,
  last_error,
  created_at,
  updated_at
`;

export async function createPending(
  client: DatabaseClient,
  input: CreatePendingEmailTaskInput,
): Promise<EmailTaskRow | null> {
  const result = await client.query<EmailTaskRow>(
    `
      INSERT INTO email_tasks (
        event_key,
        application_id,
        recipient_email,
        template_name,
        payload,
        status,
        scheduled_at,
        max_attempts
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', $6, $7)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING ${emailTaskColumns}
    `,
    [
      input.eventKey,
      input.applicationId ?? null,
      input.recipientEmail,
      input.templateName,
      JSON.stringify(input.payload),
      input.scheduledAt,
      input.maxAttempts,
    ],
  );

  return result.rows[0] ?? null;
}

export async function findByEventKey(
  client: DatabaseClient,
  eventKey: string,
): Promise<EmailTaskRow | null> {
  const result = await client.query<EmailTaskRow>(
    `SELECT ${emailTaskColumns}
     FROM email_tasks
     WHERE event_key = $1
     LIMIT 1`,
    [eventKey],
  );

  return result.rows[0] ?? null;
}

export async function findById(
  client: DatabaseClient,
  taskId: string,
): Promise<EmailTaskRow | null> {
  const result = await client.query<EmailTaskRow>(
    `SELECT ${emailTaskColumns}
     FROM email_tasks
     WHERE id = $1
     LIMIT 1`,
    [taskId],
  );

  return result.rows[0] ?? null;
}

export async function claimNextDue(
  client: DatabaseClient,
): Promise<EmailTaskRow | null> {
  const result = await client.query<EmailTaskRow>(
    `
      WITH next_task AS (
        SELECT id
        FROM email_tasks
        WHERE status = 'pending'
          AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE email_tasks
      SET status = 'processing'
      WHERE id IN (SELECT id FROM next_task)
      RETURNING ${emailTaskColumns}
    `,
  );

  return result.rows[0] ?? null;
}

export async function markSent(
  client: DatabaseClient,
  taskId: string,
): Promise<EmailTaskRow | null> {
  const result = await client.query<EmailTaskRow>(
    `
      UPDATE email_tasks
      SET
        status = 'sent',
        sent_at = NOW(),
        last_error = NULL
      WHERE id = $1
        AND status = 'processing'
      RETURNING ${emailTaskColumns}
    `,
    [taskId],
  );

  return result.rows[0] ?? null;
}

export async function rescheduleAfterFailure(
  client: DatabaseClient,
  taskId: string,
  scheduledAt: Date,
  safeErrorCode: string,
): Promise<EmailTaskRow | null> {
  const result = await client.query<EmailTaskRow>(
    `
      UPDATE email_tasks
      SET
        status = 'pending',
        attempt_count = attempt_count + 1,
        scheduled_at = $2,
        last_error = $3
      WHERE id = $1
        AND status = 'processing'
        AND attempt_count + 1 < max_attempts
      RETURNING ${emailTaskColumns}
    `,
    [taskId, scheduledAt, safeErrorCode],
  );

  return result.rows[0] ?? null;
}

export async function markFailed(
  client: DatabaseClient,
  taskId: string,
  safeErrorCode: string,
): Promise<EmailTaskRow | null> {
  const result = await client.query<EmailTaskRow>(
    `
      UPDATE email_tasks
      SET
        status = 'failed',
        attempt_count = attempt_count + 1,
        last_error = $2
      WHERE id = $1
        AND status = 'processing'
        AND attempt_count < max_attempts
      RETURNING ${emailTaskColumns}
    `,
    [taskId, safeErrorCode],
  );

  return result.rows[0] ?? null;
}

export const EmailTaskRepository = {
  createPending,
  findByEventKey,
  findById,
  claimNextDue,
  markSent,
  rescheduleAfterFailure,
  markFailed,
};
