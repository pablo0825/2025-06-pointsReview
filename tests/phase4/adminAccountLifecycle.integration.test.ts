import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "../../src/auth/password";
import { createApp } from "../../src/app";
import { closePool, pool } from "../../src/db/pool";
import { createAuthTestUser, resetAuthTestData } from "../helpers/auth";

const TEST_PASSWORD = "phase-43-admin-password";
let passwordHash: string;

async function loginAdmin() {
  const admin = await createAuthTestUser({
    displayName: "現任管理員",
    email: "admin@phase43-admin.test",
    passwordHash,
    role: "admin",
  });
  const agent = request.agent(createApp());
  expect(
    (
      await agent.post("/auth/login").send({
        email: admin.email,
        password: TEST_PASSWORD,
      })
    ).status,
  ).toBe(200);
  const csrf = await agent.get("/auth/csrf-token");
  return { admin, agent, csrfToken: csrf.body.data.csrfToken as string };
}

async function countRows(table: "users" | "advisors" | "email_tasks") {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${table}`,
  );
  return Number(result.rows[0].count);
}

describe.sequential("Phase 4.3 admin account lifecycle API", () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(TEST_PASSWORD);
  });

  beforeEach(resetAuthTestData);

  afterAll(async () => {
    await resetAuthTestData();
    await closePool();
  });

  it("creates only admin/reviewer accounts with activation task and audit", async () => {
    const { agent, csrfToken } = await loginAdmin();
    const response = await agent
      .post("/admin/users")
      .set("X-CSRF-Token", csrfToken)
      .send({
        displayName: "王承辦",
        email: "REVIEWER@PHASE43-ADMIN.TEST",
        role: "reviewer",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      displayName: "王承辦",
      email: "reviewer@phase43-admin.test",
      role: "reviewer",
      isActive: false,
      activatedAt: null,
    });
    const createdId = String(response.body.data.id);
    const task = await pool.query<{
      recipient_email: string;
      template_name: string;
      payload: Record<string, unknown>;
    }>("SELECT recipient_email, template_name, payload FROM email_tasks");
    expect(task.rows[0]).toMatchObject({
      recipient_email: "reviewer@phase43-admin.test",
      template_name: "account_activation",
    });
    expect(task.rows[0].payload).not.toHaveProperty("token");
    expect(task.rows[0].payload).toHaveProperty("activationUrl");
    const audit = await pool.query<{ action: string; resource_id: string }>(
      "SELECT action, resource_id::text FROM audit_logs WHERE action = 'user.created'",
    );
    expect(audit.rows[0]).toEqual({
      action: "user.created",
      resource_id: createdId,
    });

    const advisorRole = await agent
      .post("/admin/users")
      .set("X-CSRF-Token", csrfToken)
      .send({
        displayName: "錯誤老師",
        email: "advisor@phase43-admin.test",
        role: "advisor",
      });
    expect(advisorRole.status).toBe(422);

    const duplicate = await agent
      .post("/admin/users")
      .set("X-CSRF-Token", csrfToken)
      .send({
        displayName: "重複承辦",
        email: "reviewer@phase43-admin.test",
        role: "reviewer",
      });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("email_already_exists");
    expect(await countRows("email_tasks")).toBe(1);
  });

  it("rotates activation tokens and sends resets only for activated accounts", async () => {
    const { agent, csrfToken } = await loginAdmin();
    const pending = await agent
      .post("/admin/users")
      .set("X-CSRF-Token", csrfToken)
      .send({
        displayName: "待啟用",
        email: "pending@phase43-admin.test",
        role: "reviewer",
      });
    const pendingId = String(pending.body.data.id);
    const oldHash = await pool.query<{ activation_token_hash: Buffer }>(
      "SELECT activation_token_hash FROM users WHERE id = $1",
      [pendingId],
    );

    const resend = await agent
      .post(`/admin/users/${pendingId}/resend-activation`)
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(resend.status).toBe(200);
    const newHash = await pool.query<{ activation_token_hash: Buffer }>(
      "SELECT activation_token_hash FROM users WHERE id = $1",
      [pendingId],
    );
    expect(
      newHash.rows[0].activation_token_hash.equals(
        oldHash.rows[0].activation_token_hash,
      ),
    ).toBe(false);
    expect(await countRows("email_tasks")).toBe(2);

    const pendingReset = await agent
      .post(`/admin/users/${pendingId}/send-password-reset`)
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(pendingReset.status).toBe(409);
    expect(pendingReset.body.code).toBe("account_state_conflict");

    const inactiveActivated = await createAuthTestUser({
      email: "inactive@phase43-admin.test",
      passwordHash,
      role: "reviewer",
      isActive: false,
    });
    const reset = await agent
      .post(`/admin/users/${inactiveActivated.id}/send-password-reset`)
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(reset.status).toBe(200);
    const resetTask = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM email_tasks WHERE template_name = 'password_reset'",
    );
    expect(Number(resetTask.rows[0].count)).toBe(1);
  });

  it("transfers the active administrator and revokes the old session", async () => {
    const { admin, agent, csrfToken } = await loginAdmin();
    const target = await createAuthTestUser({
      displayName: "新管理員",
      email: "next-admin@phase43-admin.test",
      passwordHash,
      role: "admin",
      isActive: false,
    });

    const response = await agent
      .post(`/admin/users/${target.id}/transfer-admin`)
      .set("X-CSRF-Token", csrfToken)
      .send({ reason: "職務移交" });
    expect(response.status).toBe(200);
    expect((await agent.get("/auth/me")).status).toBe(401);

    const users = await pool.query<{ id: string; is_active: boolean }>(
      "SELECT id::text, is_active FROM users WHERE id = ANY($1::bigint[]) ORDER BY id",
      [[admin.id, target.id]],
    );
    expect(users.rows).toEqual([
      { id: admin.id, is_active: false },
      { id: target.id, is_active: true },
    ]);
    const session = await pool.query<{ revoked_reason: string }>(
      "SELECT revoked_reason FROM user_sessions WHERE user_id = $1",
      [admin.id],
    );
    expect(session.rows[0].revoked_reason).toBe("admin_transferred");
    const audit = await pool.query<{ metadata: Record<string, unknown> }>(
      "SELECT metadata FROM audit_logs WHERE action = 'admin.transferred'",
    );
    expect(audit.rows[0].metadata).toMatchObject({
      previous_admin_user_id: Number(admin.id),
      new_admin_user_id: Number(target.id),
      reason: "職務移交",
    });
  });

  it("creates advisor account data atomically and rolls back director conflicts", async () => {
    const { agent, csrfToken } = await loginAdmin();
    const body = {
      user: {
        displayName: "陳老師",
        email: "teacher@phase43-admin.test",
      },
      advisor: {
        employeeNumber: "T100",
        name: "陳老師",
        titleCode: 6,
        department: "多媒體設計系",
        isDirector: true,
      },
    };
    const created = await agent
      .post("/admin/advisors")
      .set("X-CSRF-Token", csrfToken)
      .send(body);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      employeeNumber: "T100",
      isDirector: true,
      account: {
        email: "teacher@phase43-admin.test",
        isActive: false,
        activatedAt: null,
      },
    });
    expect(await countRows("advisors")).toBe(1);
    expect(await countRows("email_tasks")).toBe(1);

    const duplicateEmployee = await agent
      .post("/admin/advisors")
      .set("X-CSRF-Token", csrfToken)
      .send({
        user: {
          displayName: "另一位老師",
          email: "duplicate-employee@phase43-admin.test",
        },
        advisor: {
          ...body.advisor,
          employeeNumber: "T100",
          name: "另一位老師",
          isDirector: false,
        },
      });
    expect(duplicateEmployee.status).toBe(409);
    expect(duplicateEmployee.body.code).toBe("employee_number_already_exists");
    expect(await countRows("users")).toBe(2);
    expect(await countRows("advisors")).toBe(1);

    const beforeUsers = await countRows("users");
    const conflict = await agent
      .post("/admin/advisors")
      .set("X-CSRF-Token", csrfToken)
      .send({
        user: {
          displayName: "林老師",
          email: "second-teacher@phase43-admin.test",
        },
        advisor: { ...body.advisor, employeeNumber: "T101", name: "林老師" },
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("active_director_conflict");
    expect(await countRows("users")).toBe(beforeUsers);
    expect(await countRows("advisors")).toBe(1);
    expect(await countRows("email_tasks")).toBe(1);
  });
});
