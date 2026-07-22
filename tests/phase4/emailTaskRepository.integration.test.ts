import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, pool } from "../../src/db/pool";
import { withTransaction } from "../../src/db/transaction";
import { EmailTaskRepository } from "../../src/repositories/emailTask.repository";
import { assertSafeTestDatabaseUrl } from "../helpers/database";

function assertUsingTestDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set for email task tests");
  }

  assertSafeTestDatabaseUrl(databaseUrl);
}

async function resetEmailTasks(): Promise<void> {
  assertUsingTestDatabase();
  await pool.query("DELETE FROM email_tasks");
}

function createInput(
  overrides: Partial<{
    eventKey: string;
    recipientEmail: string;
    scheduledAt: Date;
    maxAttempts: number;
  }> = {},
) {
  return {
    eventKey: overrides.eventKey ?? "test-email:user-1",
    recipientEmail: overrides.recipientEmail ?? "user@example.test",
    templateName: "test_template",
    payload: { displayName: "測試使用者" },
    scheduledAt: overrides.scheduledAt ?? new Date(Date.now() - 60_000),
    maxAttempts: overrides.maxAttempts ?? 5,
  };
}

describe.sequential("Phase 4.2 EmailTaskRepository", () => {
  beforeEach(resetEmailTasks);

  afterAll(async () => {
    await resetEmailTasks();
    await closePool();
  });

  it("creates pending tasks and leaves duplicate event keys unchanged", async () => {
    const input = createInput();
    const created = await EmailTaskRepository.createPending(pool, input);
    const duplicate = await EmailTaskRepository.createPending(pool, input);

    expect(created).toMatchObject({
      event_key: input.eventKey,
      recipient_email: input.recipientEmail,
      status: "pending",
      attempt_count: 0,
      max_attempts: 5,
      last_error: null,
    });
    expect(duplicate).toBeNull();
    await expect(
      EmailTaskRepository.findByEventKey(pool, input.eventKey),
    ).resolves.toMatchObject({ id: created?.id });
  });

  it("participates in the caller transaction and rolls back with it", async () => {
    const eventKey = "rollback:user-1";

    await expect(
      withTransaction(async (client) => {
        await EmailTaskRepository.createPending(
          client,
          createInput({ eventKey }),
        );
        throw new Error("rollback test");
      }),
    ).rejects.toThrow("rollback test");

    await expect(
      EmailTaskRepository.findByEventKey(pool, eventKey),
    ).resolves.toBeNull();
  });

  it("claims only due pending tasks in schedule order", async () => {
    const earlier = await EmailTaskRepository.createPending(
      pool,
      createInput({
        eventKey: "due-earlier",
        scheduledAt: new Date(Date.now() - 120_000),
      }),
    );
    await EmailTaskRepository.createPending(
      pool,
      createInput({
        eventKey: "due-later",
        scheduledAt: new Date(Date.now() - 60_000),
      }),
    );
    await EmailTaskRepository.createPending(
      pool,
      createInput({
        eventKey: "future",
        scheduledAt: new Date(Date.now() + 60_000),
      }),
    );

    const claimed = await EmailTaskRepository.claimNextDue(pool);

    expect(claimed).toMatchObject({
      id: earlier?.id,
      status: "processing",
    });
    const second = await EmailTaskRepository.claimNextDue(pool);
    expect(second?.event_key).toBe("due-later");
    await expect(EmailTaskRepository.claimNextDue(pool)).resolves.toBeNull();
  });

  it("does not let parallel claim calls acquire the same task", async () => {
    const created = await EmailTaskRepository.createPending(
      pool,
      createInput(),
    );
    const results = await Promise.all([
      EmailTaskRepository.claimNextDue(pool),
      EmailTaskRepository.claimNextDue(pool),
    ]);
    const claimed = results.filter((task) => task !== null);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe(created?.id);
  });

  it("marks processing tasks sent and clears their previous error", async () => {
    const created = await EmailTaskRepository.createPending(
      pool,
      createInput(),
    );
    const claimed = await EmailTaskRepository.claimNextDue(pool);
    await pool.query("UPDATE email_tasks SET last_error = $2 WHERE id = $1", [
      created?.id,
      "provider_timeout",
    ]);

    const sent = await EmailTaskRepository.markSent(pool, claimed!.id);

    expect(sent).toMatchObject({
      status: "sent",
      attempt_count: 0,
      last_error: null,
    });
    expect(sent?.sent_at).toBeInstanceOf(Date);
    await expect(
      EmailTaskRepository.markSent(pool, claimed!.id),
    ).resolves.toBeNull();
  });

  it("increments attempts when rescheduling or permanently failing", async () => {
    await EmailTaskRepository.createPending(
      pool,
      createInput({ eventKey: "retry-task" }),
    );
    const retryTask = await EmailTaskRepository.claimNextDue(pool);
    const retryAt = new Date(Date.now() + 5 * 60_000);
    const rescheduled = await EmailTaskRepository.rescheduleAfterFailure(
      pool,
      retryTask!.id,
      retryAt,
      "provider_timeout",
    );

    expect(rescheduled).toMatchObject({
      status: "pending",
      attempt_count: 1,
      last_error: "provider_timeout",
    });
    expect(rescheduled?.scheduled_at.getTime()).toBe(retryAt.getTime());

    await EmailTaskRepository.createPending(
      pool,
      createInput({ eventKey: "failed-task", maxAttempts: 1 }),
    );
    const failedTask = await EmailTaskRepository.claimNextDue(pool);
    const failed = await EmailTaskRepository.markFailed(
      pool,
      failedTask!.id,
      "recipient_rejected",
    );

    expect(failed).toMatchObject({
      status: "failed",
      attempt_count: 1,
      max_attempts: 1,
      last_error: "recipient_rejected",
    });
  });

  it("cancels only pending advisor notifications for the selected version", async () => {
    for (const eventKey of [
      "advisor-sign-request:application-10:version-2",
      "advisor-sign-reminder-1:application-10:version-2",
      "advisor-sign-reminder-2:application-10:version-2",
      "advisor-sign-reminder-1:application-10:version-1",
      "unrelated:application-10",
    ]) {
      await EmailTaskRepository.createPending(pool, createInput({ eventKey }));
    }
    const sent = await EmailTaskRepository.findByEventKey(
      pool,
      "advisor-sign-request:application-10:version-2",
    );
    await pool.query(
      "UPDATE email_tasks SET status = 'sent', sent_at = NOW() WHERE id = $1",
      [sent!.id],
    );

    await expect(
      EmailTaskRepository.cancelPendingAdvisorNotifications(pool, "10", 2),
    ).resolves.toBe(2);

    const statuses = await pool.query<{ event_key: string; status: string }>(
      "SELECT event_key, status FROM email_tasks ORDER BY event_key",
    );
    expect(
      Object.fromEntries(
        statuses.rows.map((row) => [row.event_key, row.status]),
      ),
    ).toMatchObject({
      "advisor-sign-request:application-10:version-2": "sent",
      "advisor-sign-reminder-1:application-10:version-2": "cancelled",
      "advisor-sign-reminder-2:application-10:version-2": "cancelled",
      "advisor-sign-reminder-1:application-10:version-1": "pending",
      "unrelated:application-10": "pending",
    });
  });
});
