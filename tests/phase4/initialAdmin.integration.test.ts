import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, pool } from "../../src/db/pool";
import { parseAdminCreateArguments } from "../../src/maintenance/adminCreate.cli";
import {
  InitialAdminError,
  InitialAdminService,
} from "../../src/services/initialAdmin.service";
import { createAuthTestUser, resetAuthTestData } from "../helpers/auth";

describe.sequential("Phase 4.3 initial admin maintenance command", () => {
  beforeEach(resetAuthTestData);

  afterAll(async () => {
    await resetAuthTestData();
    await closePool();
  });

  it("parses the documented positional arguments and --resend", () => {
    expect(
      parseAdminCreateArguments([
        "ADMIN@EXAMPLE.TEST",
        "系統管理員",
        "--resend",
      ]),
    ).toEqual({
      email: "admin@example.test",
      displayName: "系統管理員",
      resend: true,
    });
    expect(() => parseAdminCreateArguments(["admin@example.test"])).toThrow(
      "Usage",
    );
  });

  it("creates an inactive admin, activation task, and maintenance audit", async () => {
    const result = await InitialAdminService.createInitialAdmin({
      email: "initial@example.test",
      displayName: "初始管理員",
      resend: false,
    });

    expect(result.resent).toBe(false);
    const user = await pool.query<{
      role: string;
      is_active: boolean;
      password_hash: string | null;
      activation_token_hash: Buffer;
    }>(
      "SELECT role, is_active, password_hash, activation_token_hash FROM users WHERE id = $1",
      [result.userId],
    );
    expect(user.rows[0]).toMatchObject({
      role: "admin",
      is_active: false,
      password_hash: null,
    });
    expect(user.rows[0].activation_token_hash).toHaveLength(32);

    const task = await pool.query<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM email_tasks",
    );
    expect(task.rows[0].payload).toHaveProperty("activationUrl");
    const audit = await pool.query<{
      actor_type: string;
      actor_user_id: string | null;
      action: string;
      metadata: Record<string, unknown>;
    }>(
      "SELECT actor_type, actor_user_id::text, action, metadata FROM audit_logs",
    );
    expect(audit.rows[0]).toMatchObject({
      actor_type: "maintenance",
      actor_user_id: null,
      action: "maintenance.admin_created",
      metadata: { created_user_id: Number(result.userId) },
    });
    expect(JSON.stringify(audit.rows[0].metadata)).not.toContain("token");
  });

  it("rotates only an unactivated admin token and records maintenance actor", async () => {
    const created = await InitialAdminService.createInitialAdmin({
      email: "initial@example.test",
      displayName: "初始管理員",
      resend: false,
    });
    const before = await pool.query<{ activation_token_hash: Buffer }>(
      "SELECT activation_token_hash FROM users WHERE id = $1",
      [created.userId],
    );

    const resent = await InitialAdminService.createInitialAdmin({
      email: "initial@example.test",
      displayName: "初始管理員",
      resend: true,
    });
    expect(resent).toEqual({ userId: created.userId, resent: true });
    const after = await pool.query<{ activation_token_hash: Buffer }>(
      "SELECT activation_token_hash FROM users WHERE id = $1",
      [created.userId],
    );
    expect(
      after.rows[0].activation_token_hash.equals(
        before.rows[0].activation_token_hash,
      ),
    ).toBe(false);

    const taskCount = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM email_tasks",
    );
    expect(Number(taskCount.rows[0].count)).toBe(2);
    const resendAudit = await pool.query<{ actor_type: string }>(
      "SELECT actor_type FROM audit_logs WHERE action = 'user.activation_resent'",
    );
    expect(resendAudit.rows[0].actor_type).toBe("maintenance");
  });

  it("rejects duplicate create and resend for a non-admin account", async () => {
    await InitialAdminService.createInitialAdmin({
      email: "initial@example.test",
      displayName: "初始管理員",
      resend: false,
    });
    await expect(
      InitialAdminService.createInitialAdmin({
        email: "initial@example.test",
        displayName: "初始管理員",
        resend: false,
      }),
    ).rejects.toMatchObject<Partial<InitialAdminError>>({
      code: "email_already_exists",
    });

    await createAuthTestUser({
      email: "reviewer@example.test",
      passwordHash: null,
      role: "reviewer",
      isActive: false,
      isActivated: false,
    });
    await expect(
      InitialAdminService.createInitialAdmin({
        email: "reviewer@example.test",
        displayName: "承辦人",
        resend: true,
      }),
    ).rejects.toMatchObject<Partial<InitialAdminError>>({
      code: "resend_account_state_conflict",
    });
  });
});
