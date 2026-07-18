import { pool } from "../db/pool";
import type { DatabaseClient } from "../db/types";
import {
  isEmailProviderError,
  type EmailProvider,
} from "../email/emailProvider";
import type {
  EmailTemplateName,
  EmailTemplateRenderer,
} from "../email/emailTemplate";
import {
  EmailTaskRepository,
  type EmailTaskRow,
} from "../repositories/emailTask.repository";

const DEFAULT_MAX_TASKS = 10;
const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export interface ProcessEmailTasksOptions {
  provider: EmailProvider;
  renderer: EmailTemplateRenderer;
  client?: DatabaseClient;
  maxTasks?: number;
  now?: () => Date;
}

export interface ProcessEmailTasksResult {
  claimed: number;
  sent: number;
  rescheduled: number;
  failed: number;
}

interface DeliveryFailure {
  safeCode: string;
  retryable: boolean;
}

function assertValidMaxTasks(maxTasks: number): void {
  if (!Number.isInteger(maxTasks) || maxTasks <= 0) {
    throw new Error("Email worker maxTasks must be a positive integer");
  }
}

function classifyProviderFailure(error: unknown): DeliveryFailure {
  if (isEmailProviderError(error)) {
    return {
      safeCode: error.safeCode,
      retryable: error.retryable,
    };
  }

  return {
    safeCode: "provider_unknown_error",
    retryable: true,
  };
}

function getRetryAt(attemptCount: number, now: Date): Date {
  const delayIndex = Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1);
  return new Date(now.getTime() + RETRY_DELAYS_MS[delayIndex]);
}

async function persistFailure(
  client: DatabaseClient,
  task: EmailTaskRow,
  failure: DeliveryFailure,
  now: Date,
): Promise<"rescheduled" | "failed"> {
  const nextAttemptCount = task.attempt_count + 1;

  if (failure.retryable && nextAttemptCount < task.max_attempts) {
    const rescheduled = await EmailTaskRepository.rescheduleAfterFailure(
      client,
      task.id,
      getRetryAt(nextAttemptCount, now),
      failure.safeCode,
    );

    if (!rescheduled) {
      throw new Error(`Unable to reschedule processing email task ${task.id}`);
    }

    return "rescheduled";
  }

  const failed = await EmailTaskRepository.markFailed(
    client,
    task.id,
    failure.safeCode,
  );

  if (!failed) {
    throw new Error(`Unable to fail processing email task ${task.id}`);
  }

  return "failed";
}

async function processClaimedTask(
  client: DatabaseClient,
  task: EmailTaskRow,
  provider: EmailProvider,
  renderer: EmailTemplateRenderer,
  now: () => Date,
): Promise<"sent" | "rescheduled" | "failed"> {
  let rendered;

  try {
    rendered = await renderer.render(
      task.template_name as EmailTemplateName,
      task.payload,
    );
  } catch {
    return persistFailure(
      client,
      task,
      { safeCode: "template_render_failed", retryable: false },
      now(),
    );
  }

  try {
    await provider.send({
      to: task.recipient_email,
      subject: rendered.subject,
      html: rendered.html,
      ...(rendered.text === undefined ? {} : { text: rendered.text }),
    });
  } catch (error) {
    return persistFailure(client, task, classifyProviderFailure(error), now());
  }

  const sent = await EmailTaskRepository.markSent(client, task.id);

  if (!sent) {
    throw new Error(`Unable to mark processing email task ${task.id} sent`);
  }

  return "sent";
}

export async function processDueEmailTasks(
  options: ProcessEmailTasksOptions,
): Promise<ProcessEmailTasksResult> {
  const client = options.client ?? pool;
  const maxTasks = options.maxTasks ?? DEFAULT_MAX_TASKS;
  const now = options.now ?? (() => new Date());
  assertValidMaxTasks(maxTasks);

  const result: ProcessEmailTasksResult = {
    claimed: 0,
    sent: 0,
    rescheduled: 0,
    failed: 0,
  };

  while (result.claimed < maxTasks) {
    const task = await EmailTaskRepository.claimNextDue(client);

    if (!task) {
      break;
    }

    result.claimed += 1;
    const outcome = await processClaimedTask(
      client,
      task,
      options.provider,
      options.renderer,
      now,
    );
    result[outcome] += 1;
  }

  return result;
}
