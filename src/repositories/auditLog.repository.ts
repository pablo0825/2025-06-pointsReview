import type { DatabaseClient } from "../db/types";

export interface CreateAuditLogInput {
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
}

export async function insert(
  client: DatabaseClient,
  input: CreateAuditLogInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO audit_logs (
        actor_type,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        metadata,
        ip_address,
        user_agent
      )
      VALUES ('user', $1, $2, $3, $4, $5::jsonb, $6, $7)
    `,
    [
      input.actorUserId,
      input.action,
      input.resourceType,
      input.resourceId,
      JSON.stringify(input.metadata),
      input.ipAddress,
      input.userAgent,
    ],
  );
}

export const AuditLogRepository = { insert };
