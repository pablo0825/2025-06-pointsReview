import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

import {
  emailTemplateNames,
  type EmailTemplateName,
} from "../email/emailTemplate";
import type { DatabaseClient } from "../db/types";
import {
  EmailTaskRepository,
  type EmailTaskRow,
} from "../repositories/emailTask.repository";

const DEFAULT_MAX_ATTEMPTS = 5;

const createEmailTaskSchema = z.object({
  eventKey: z.string().trim().min(1).max(160),
  applicationId: z.string().regex(/^\d+$/).nullable().optional(),
  recipientEmail: z.string().trim().email().max(320).toLowerCase(),
  templateName: z.enum(emailTemplateNames),
  scheduledAt: z.date(),
  maxAttempts: z.number().int().positive().default(DEFAULT_MAX_ATTEMPTS),
});

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface CreateEmailTaskInput {
  eventKey: string;
  applicationId?: string | null;
  recipientEmail: string;
  templateName: EmailTemplateName;
  payload: Record<string, unknown>;
  scheduledAt: Date;
  maxAttempts?: number;
}

export class EmailTaskInputError extends Error {
  readonly code: "invalid_email_task_input" | "email_event_key_conflict";

  constructor(
    code: "invalid_email_task_input" | "email_event_key_conflict",
    message: string,
  ) {
    super(message);
    this.name = "EmailTaskInputError";
    this.code = code;
  }
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSensitivePayloadKey(key: string): boolean {
  const normalized = key.replace(/[_-]/g, "").toLowerCase();

  if (
    /(hash|secret|credential|csrf|session|smtp|apikey|privatekey|authorization)/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (normalized.endsWith("url")) {
    return false;
  }

  return /(password|token)/.test(normalized);
}

function normalizeJsonValue(value: unknown, path: string): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new EmailTaskInputError(
        "invalid_email_task_input",
        `Email payload ${path} must be a finite number`,
      );
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeJsonValue(item, `${path}.${index}`),
    );
  }

  if (typeof value === "object" && isPlainObject(value)) {
    const normalized: Record<string, JsonValue> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (isSensitivePayloadKey(key)) {
        throw new EmailTaskInputError(
          "invalid_email_task_input",
          `Email payload contains forbidden field at ${path}.${key}`,
        );
      }

      normalized[key] = normalizeJsonValue(nestedValue, `${path}.${key}`);
    }

    return normalized;
  }

  throw new EmailTaskInputError(
    "invalid_email_task_input",
    `Email payload ${path} must contain JSON values only`,
  );
}

function normalizePayload(
  payload: Record<string, unknown>,
): Record<string, JsonValue> {
  if (!isPlainObject(payload)) {
    throw new EmailTaskInputError(
      "invalid_email_task_input",
      "Email payload must be a plain object",
    );
  }

  return normalizeJsonValue(payload, "payload") as Record<string, JsonValue>;
}

function taskMatchesInput(
  task: EmailTaskRow,
  input: {
    applicationId: string | null;
    recipientEmail: string;
    templateName: EmailTemplateName;
    payload: Record<string, JsonValue>;
    maxAttempts: number;
  },
): boolean {
  return (
    task.application_id === input.applicationId &&
    task.recipient_email === input.recipientEmail &&
    task.template_name === input.templateName &&
    isDeepStrictEqual(task.payload, input.payload) &&
    task.max_attempts === input.maxAttempts
  );
}

export async function createPendingTask(
  client: DatabaseClient,
  input: CreateEmailTaskInput,
): Promise<EmailTaskRow> {
  const parsed = createEmailTaskSchema.safeParse(input);

  if (!parsed.success) {
    throw new EmailTaskInputError(
      "invalid_email_task_input",
      "Email task input is invalid",
    );
  }

  const normalizedPayload = normalizePayload(input.payload);
  const normalized = {
    ...parsed.data,
    applicationId: parsed.data.applicationId ?? null,
    payload: normalizedPayload,
  };
  const created = await EmailTaskRepository.createPending(client, normalized);

  if (created) {
    return created;
  }

  const existing = await EmailTaskRepository.findByEventKey(
    client,
    normalized.eventKey,
  );

  if (existing && taskMatchesInput(existing, normalized)) {
    return existing;
  }

  throw new EmailTaskInputError(
    "email_event_key_conflict",
    "Email event key already exists with different task content",
  );
}

export const EmailTaskService = { createPendingTask };
