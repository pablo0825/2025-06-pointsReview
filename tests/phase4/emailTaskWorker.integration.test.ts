import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, pool } from "../../src/db/pool";
import { withTransaction } from "../../src/db/transaction";
import {
  EmailProviderError,
  type EmailMessage,
  type EmailProvider,
} from "../../src/email/emailProvider";
import type {
  EmailTemplateName,
  EmailTemplateRenderer,
  RenderedEmail,
} from "../../src/email/emailTemplate";
import { EmailTaskRepository } from "../../src/repositories/emailTask.repository";
import {
  EmailTaskInputError,
  EmailTaskService,
  type CreateEmailTaskInput,
} from "../../src/services/emailTask.service";
import { processDueEmailTasks } from "../../src/workers/processEmailTasks";
import { assertSafeTestDatabaseUrl } from "../helpers/database";

class FakeRenderer implements EmailTemplateRenderer {
  readonly calls: Array<{
    templateName: EmailTemplateName;
    payload: Record<string, unknown>;
  }> = [];
  error: Error | null = null;

  async render(
    templateName: EmailTemplateName,
    payload: Record<string, unknown>,
  ): Promise<RenderedEmail> {
    this.calls.push({ templateName, payload });

    if (this.error) {
      throw this.error;
    }

    return {
      subject: `Subject: ${templateName}`,
      html: `<p>${String(payload.displayName ?? "通知")}</p>`,
      text: String(payload.displayName ?? "通知"),
    };
  }
}

class FakeProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];
  error: Error | null = null;
  beforeSend?: () => Promise<void>;

  async send(message: EmailMessage): Promise<void> {
    if (this.beforeSend) {
      await this.beforeSend();
    }

    this.messages.push(message);

    if (this.error) {
      throw this.error;
    }
  }
}

function assertUsingTestDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set for email worker tests");
  }

  assertSafeTestDatabaseUrl(databaseUrl);
}

async function resetEmailTasks(): Promise<void> {
  assertUsingTestDatabase();
  await pool.query("DELETE FROM email_tasks");
}

function createInput(
  overrides: Partial<CreateEmailTaskInput> = {},
): CreateEmailTaskInput {
  return {
    eventKey: overrides.eventKey ?? "account-activation:user-1",
    applicationId: overrides.applicationId,
    recipientEmail: overrides.recipientEmail ?? "USER@EXAMPLE.TEST ",
    templateName: overrides.templateName ?? "account_activation",
    payload: overrides.payload ?? {
      displayName: "測試使用者",
      activationUrl: "https://example.test/activate/raw-one-time-token",
    },
    scheduledAt: overrides.scheduledAt ?? new Date(Date.now() - 60_000),
    maxAttempts: overrides.maxAttempts,
  };
}

async function findTask(eventKey: string) {
  const task = await EmailTaskRepository.findByEventKey(pool, eventKey);

  if (!task) {
    throw new Error(`Email task ${eventKey} not found`);
  }

  return task;
}

describe.sequential("Phase 4.2 EmailTaskService and worker", () => {
  beforeEach(resetEmailTasks);

  afterAll(async () => {
    await resetEmailTasks();
    await closePool();
  });

  it("creates normalized tasks and allows one-time token URLs", async () => {
    const created = await EmailTaskService.createPendingTask(
      pool,
      createInput(),
    );

    expect(created).toMatchObject({
      recipient_email: "user@example.test",
      template_name: "account_activation",
      payload: {
        displayName: "測試使用者",
        activationUrl: "https://example.test/activate/raw-one-time-token",
      },
      max_attempts: 5,
    });
  });

  it.each([
    { password: "secret" },
    { nested: { passwordHash: "hash-value" } },
    { activationToken: "raw-token" },
    { csrf_token: "csrf-value" },
    { smtpCredential: "smtp-secret" },
    { smtpCredentialUrl: "https://example.test/credential" },
    { apiKey: "provider-api-key" },
  ])("rejects sensitive payload fields", async (payload) => {
    await expect(
      EmailTaskService.createPendingTask(
        pool,
        createInput({
          eventKey: `sensitive-${Object.keys(payload)[0]}`,
          payload,
        }),
      ),
    ).rejects.toMatchObject({
      code: "invalid_email_task_input",
    });
  });

  it("returns the existing task for an immutable match after retry state changes", async () => {
    const originalInput = createInput({
      payload: { second: 2, first: 1 },
    });
    const created = await EmailTaskService.createPendingTask(
      pool,
      originalInput,
    );
    const claimed = await EmailTaskRepository.claimNextDue(pool);
    await EmailTaskRepository.rescheduleAfterFailure(
      pool,
      claimed!.id,
      new Date(Date.now() + 5 * 60_000),
      "provider_timeout",
    );

    const repeated = await EmailTaskService.createPendingTask(pool, {
      ...originalInput,
      payload: { first: 1, second: 2 },
    });

    expect(repeated.id).toBe(created.id);
    expect(repeated.status).toBe("pending");
    expect(repeated.attempt_count).toBe(1);
  });

  it("rejects an event key reused for different immutable content", async () => {
    const input = createInput();
    await EmailTaskService.createPendingTask(pool, input);

    await expect(
      EmailTaskService.createPendingTask(pool, {
        ...input,
        recipientEmail: "different@example.test",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<EmailTaskInputError>>({
        code: "email_event_key_conflict",
      }),
    );

    const count = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM email_tasks",
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("rolls service-created tasks back with the business transaction", async () => {
    const eventKey = "rollback-service:user-1";

    await expect(
      withTransaction(async (client) => {
        await EmailTaskService.createPendingTask(
          client,
          createInput({ eventKey }),
        );
        throw new Error("business transaction failed");
      }),
    ).rejects.toThrow("business transaction failed");

    await expect(
      EmailTaskRepository.findByEventKey(pool, eventKey),
    ).resolves.toBeNull();
  });

  it("renders and sends due tasks with the fake adapters", async () => {
    await EmailTaskService.createPendingTask(pool, createInput());
    const renderer = new FakeRenderer();
    const provider = new FakeProvider();

    const result = await processDueEmailTasks({ renderer, provider });

    expect(result).toEqual({
      claimed: 1,
      sent: 1,
      rescheduled: 0,
      failed: 0,
    });
    expect(renderer.calls).toHaveLength(1);
    expect(provider.messages).toEqual([
      {
        to: "user@example.test",
        subject: "Subject: account_activation",
        html: "<p>測試使用者</p>",
        text: "測試使用者",
      },
    ]);

    const task = await findTask("account-activation:user-1");
    expect(task.status).toBe("sent");
    expect(task.sent_at).toBeInstanceOf(Date);
    expect(task.last_error).toBeNull();
  });

  it("claims only one task at a time and honors maxTasks", async () => {
    await EmailTaskService.createPendingTask(
      pool,
      createInput({ eventKey: "task-one" }),
    );
    await EmailTaskService.createPendingTask(
      pool,
      createInput({ eventKey: "task-two" }),
    );
    const renderer = new FakeRenderer();
    const provider = new FakeProvider();
    provider.beforeSend = async () => {
      const statuses = await pool.query<{ status: string; count: string }>(
        "SELECT status, COUNT(*)::text AS count FROM email_tasks GROUP BY status",
      );
      expect(statuses.rows).toEqual(
        expect.arrayContaining([
          { status: "pending", count: "1" },
          { status: "processing", count: "1" },
        ]),
      );
    };

    const result = await processDueEmailTasks({
      renderer,
      provider,
      maxTasks: 1,
    });

    expect(result.claimed).toBe(1);
    expect(provider.messages).toHaveLength(1);
    const statuses = await pool.query<{ status: string; count: string }>(
      "SELECT status, COUNT(*)::text AS count FROM email_tasks GROUP BY status",
    );
    expect(statuses.rows).toEqual(
      expect.arrayContaining([
        { status: "pending", count: "1" },
        { status: "sent", count: "1" },
      ]),
    );
  });

  it("reschedules retryable failures with the documented backoff", async () => {
    const now = new Date();
    await EmailTaskService.createPendingTask(pool, createInput());
    const renderer = new FakeRenderer();
    const provider = new FakeProvider();
    provider.error = new EmailProviderError("provider_timeout", true);

    const result = await processDueEmailTasks({
      renderer,
      provider,
      now: () => now,
    });
    const task = await findTask("account-activation:user-1");

    expect(result.rescheduled).toBe(1);
    expect(task).toMatchObject({
      status: "pending",
      attempt_count: 1,
      last_error: "provider_timeout",
    });
    expect(task.scheduled_at.getTime()).toBe(now.getTime() + 5 * 60_000);
  });

  it("defaults unknown provider failures to safe retryable errors", async () => {
    await EmailTaskService.createPendingTask(pool, createInput());
    const renderer = new FakeRenderer();
    const provider = new FakeProvider();
    provider.error = new Error(
      "SMTP password=do-not-store recipient=user@example.test raw-token",
    );

    await processDueEmailTasks({ renderer, provider });
    const task = await findTask("account-activation:user-1");

    expect(task.status).toBe("pending");
    expect(task.last_error).toBe("provider_unknown_error");
    expect(task.last_error).not.toContain("password");
    expect(task.last_error).not.toContain("raw-token");
  });

  it("permanently fails renderer and non-retryable provider errors", async () => {
    await EmailTaskService.createPendingTask(
      pool,
      createInput({ eventKey: "render-failure" }),
    );
    const renderer = new FakeRenderer();
    renderer.error = new Error("payload included secret-token");
    const provider = new FakeProvider();

    const renderResult = await processDueEmailTasks({ renderer, provider });
    expect(renderResult.failed).toBe(1);
    expect((await findTask("render-failure")).last_error).toBe(
      "template_render_failed",
    );
    expect(provider.messages).toHaveLength(0);

    await EmailTaskService.createPendingTask(
      pool,
      createInput({ eventKey: "recipient-failure" }),
    );
    renderer.error = null;
    provider.error = new EmailProviderError("recipient_rejected", false);

    const providerResult = await processDueEmailTasks({ renderer, provider });
    expect(providerResult.failed).toBe(1);
    expect((await findTask("recipient-failure")).last_error).toBe(
      "recipient_rejected",
    );
  });

  it("marks a retryable error failed when max attempts is reached", async () => {
    const created = await EmailTaskService.createPendingTask(
      pool,
      createInput({ maxAttempts: 5 }),
    );
    await pool.query("UPDATE email_tasks SET attempt_count = 4 WHERE id = $1", [
      created.id,
    ]);
    const renderer = new FakeRenderer();
    const provider = new FakeProvider();
    provider.error = new EmailProviderError("provider_unavailable", true);

    const result = await processDueEmailTasks({ renderer, provider });
    const task = await findTask("account-activation:user-1");

    expect(result.failed).toBe(1);
    expect(task).toMatchObject({
      status: "failed",
      attempt_count: 5,
      last_error: "provider_unavailable",
    });
  });

  it("does not deliver the same task from parallel workers", async () => {
    await EmailTaskService.createPendingTask(pool, createInput());
    const firstProvider = new FakeProvider();
    const secondProvider = new FakeProvider();

    const results = await Promise.all([
      processDueEmailTasks({
        renderer: new FakeRenderer(),
        provider: firstProvider,
        maxTasks: 1,
      }),
      processDueEmailTasks({
        renderer: new FakeRenderer(),
        provider: secondProvider,
        maxTasks: 1,
      }),
    ]);

    expect(results.reduce((total, result) => total + result.claimed, 0)).toBe(
      1,
    );
    expect(firstProvider.messages.length + secondProvider.messages.length).toBe(
      1,
    );
    expect((await findTask("account-activation:user-1")).status).toBe("sent");
  });
});
