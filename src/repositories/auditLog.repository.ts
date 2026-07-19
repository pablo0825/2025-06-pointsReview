import type { DatabaseClient } from "../db/types";

export interface CreateAuditLogInput {
  actorType: "user" | "system" | "maintenance";
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
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
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
    `,
    [
      input.actorType,
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
