import type { DatabaseClient } from "../db/types";
import { AuditLogRepository } from "../repositories/auditLog.repository";

const sensitiveMetadataKeyPattern =
  /(password|token|hash|secret|csrf|storage.?key)/i;

export interface AuditActorContext {
  actorUserId: string;
  ipAddress: string;
  userAgent: string;
}

export interface RecordAuditLogInput extends AuditActorContext {
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata?: Record<string, unknown>;
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadataValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !sensitiveMetadataKeyPattern.test(key))
        .map(([key, nestedValue]) => [key, sanitizeMetadataValue(nestedValue)]),
    );
  }

  return value;
}

export async function record(
  client: DatabaseClient,
  input: RecordAuditLogInput,
): Promise<void> {
  const metadata = sanitizeMetadataValue(input.metadata ?? {}) as Record<
    string,
    unknown
  >;

  await AuditLogRepository.insert(client, {
    ...input,
    actorType: "user",
    metadata,
  });
}

export interface RecordMaintenanceAuditLogInput {
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordMaintenance(
  client: DatabaseClient,
  input: RecordMaintenanceAuditLogInput,
): Promise<void> {
  const metadata = sanitizeMetadataValue(input.metadata ?? {}) as Record<
    string,
    unknown
  >;
  await AuditLogRepository.insert(client, {
    actorType: "maintenance",
    actorUserId: null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata,
    ipAddress: null,
    userAgent: null,
  });
}

export const AuditLogService = { record, recordMaintenance };
