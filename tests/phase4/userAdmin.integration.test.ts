import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "../../src/auth/password";
import { createApp } from "../../src/app";
import { closePool, pool } from "../../src/db/pool";
import { createAuthTestUser, resetAuthTestData } from "../helpers/auth";

const TEST_PASSWORD = "phase-4-user-admin-password";
let passwordHash: string;

async function login(email: string) {
  const agent = request.agent(createApp());
  const loginResponse = await agent.post("/auth/login").send({
    email,
    password: TEST_PASSWORD,
  });

  expect(loginResponse.status).toBe(200);
  const csrfResponse = await agent.get("/auth/csrf-token");
  expect(csrfResponse.status).toBe(200);

  return {
    agent,
    csrfToken: csrfResponse.body.data.csrfToken as string,
  };
}

async function createAdminAndLogin() {
  const admin = await createAuthTestUser({
    displayName: "管理員",
    email: "admin@phase4.test",
    passwordHash,
    role: "admin",
  });
  const auth = await login(admin.email);

  return { admin, ...auth };
}

async function countAuditLogs(action: string, resourceId: string) {
  const result = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM audit_logs
      WHERE action = $1 AND resource_id = $2
    `,
    [action, resourceId],
  );

  return Number(result.rows[0].count);
}

describe.sequential("Phase 4.1 user administration API", () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(TEST_PASSWORD);
  });

  beforeEach(resetAuthTestData);

  afterAll(async () => {
    await resetAuthTestData();
    await closePool();
  });

  it("lists, filters, paginates, and reads safe user resources", async () => {
    const { agent } = await createAdminAndLogin();
    const reviewer = await createAuthTestUser({
      displayName: "王承辦",
      email: "reviewer@phase4.test",
      passwordHash,
      role: "reviewer",
    });
    const advisor = await createAuthTestUser({
      displayName: "林老師",
      email: "advisor@phase4.test",
      passwordHash,
      role: "advisor",
    });

    const listResponse = await agent.get("/admin/users?page=1&pageSize=2");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
    expect(
      listResponse.body.data.map((user: { id: number }) => user.id),
    ).toEqual([Number(advisor.id), Number(reviewer.id)]);
    expect(listResponse.body.data[0]).not.toHaveProperty("passwordHash");
    expect(listResponse.body.data[0]).not.toHaveProperty("updatedAt");

    const filteredResponse = await agent.get(
      "/admin/users?role=reviewer&isActive=true&keyword=%E7%8E%8B",
    );
    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.data).toHaveLength(1);
    expect(filteredResponse.body.data[0].email).toBe(reviewer.email);

    const detailResponse = await agent.get(`/admin/users/${reviewer.id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data).toMatchObject({
      id: Number(reviewer.id),
      displayName: reviewer.displayName,
      email: reviewer.email,
      role: "reviewer",
      isActive: true,
    });
    expect(detailResponse.body.data).toHaveProperty("updatedAt");
    expect(detailResponse.body.data).not.toHaveProperty("passwordHash");
  });

  it("requires authentication and the matching user permission", async () => {
    const unauthenticated = await request(createApp()).get("/admin/users");
    expect(unauthenticated.status).toBe(401);

    const reviewer = await createAuthTestUser({
      email: "reviewer@phase4.test",
      passwordHash,
      role: "reviewer",
    });
    const { agent } = await login(reviewer.email);
    const forbidden = await agent.get("/admin/users");

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe("forbidden");
  });

  it("updates only allowed fields, normalizes email, and audits once", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    const target = await createAuthTestUser({
      displayName: "原名稱",
      email: "target@phase4.test",
      passwordHash,
      role: "reviewer",
    });
    const body = {
      displayName: "新名稱",
      email: "NEW.EMAIL@PHASE4.TEST",
    };

    const response = await agent
      .patch(`/admin/users/${target.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: Number(target.id),
      displayName: "新名稱",
      email: "new.email@phase4.test",
      role: "reviewer",
    });
    expect(response.body.data).not.toHaveProperty("passwordHash");

    const repeated = await agent
      .patch(`/admin/users/${target.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send(body);
    expect(repeated.status).toBe(200);
    expect(await countAuditLogs("user.updated", target.id)).toBe(1);

    const audit = await pool.query<{ metadata: Record<string, unknown> }>(
      "SELECT metadata FROM audit_logs WHERE action = 'user.updated'",
    );
    expect(audit.rows[0].metadata).toEqual({
      changed_fields: ["display_name", "email"],
    });
  });

  it("maps duplicate email, CSRF, and invalid body failures", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    const target = await createAuthTestUser({
      email: "target@phase4.test",
      passwordHash,
    });
    await createAuthTestUser({
      email: "existing@phase4.test",
      passwordHash,
    });

    const duplicate = await agent
      .patch(`/admin/users/${target.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ email: "existing@phase4.test" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("email_already_exists");

    const missingCsrf = await agent
      .patch(`/admin/users/${target.id}`)
      .send({ displayName: "不能更新" });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.code).toBe("csrf_token_invalid");

    const invalidBody = await agent
      .patch(`/admin/users/${target.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(invalidBody.status).toBe(422);
    expect(invalidBody.body.code).toBe("validation_failed");
  });

  it("activates eligible accounts idempotently and rejects incomplete activation", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    const eligible = await createAuthTestUser({
      email: "eligible@phase4.test",
      passwordHash,
      isActive: false,
    });
    const incomplete = await createAuthTestUser({
      email: "incomplete@phase4.test",
      passwordHash,
      isActive: false,
      isActivated: false,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await agent
        .post(`/admin/users/${eligible.id}/activate`)
        .set("X-CSRF-Token", csrfToken);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { ok: true } });
    }

    expect(await countAuditLogs("user.activated", eligible.id)).toBe(1);
    const active = await pool.query<{ is_active: boolean }>(
      "SELECT is_active FROM users WHERE id = $1",
      [eligible.id],
    );
    expect(active.rows[0].is_active).toBe(true);

    const conflict = await agent
      .post(`/admin/users/${incomplete.id}/activate`)
      .set("X-CSRF-Token", csrfToken);
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("account_state_conflict");
  });

  it("deactivates users with session revocation and one audit log", async () => {
    const target = await createAuthTestUser({
      email: "target@phase4.test",
      passwordHash,
      role: "reviewer",
    });
    const targetAuth = await login(target.email);
    const { agent, csrfToken } = await createAdminAndLogin();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await agent
        .post(`/admin/users/${target.id}/deactivate`)
        .set("X-CSRF-Token", csrfToken)
        .send({ reason: "人員異動" });
      expect(response.status).toBe(200);
    }

    const rejectedSession = await targetAuth.agent.get("/auth/me");
    expect(rejectedSession.status).toBe(401);
    expect(await countAuditLogs("user.deactivated", target.id)).toBe(1);
    expect(await countAuditLogs("user.sessions_revoked", target.id)).toBe(1);

    const session = await pool.query<{
      revoked_at: Date | null;
      revoked_reason: string | null;
    }>(
      "SELECT revoked_at, revoked_reason FROM user_sessions WHERE user_id = $1",
      [target.id],
    );
    expect(session.rows[0].revoked_at).toBeInstanceOf(Date);
    expect(session.rows[0].revoked_reason).toBe("account_deactivated");
  });

  it("preserves the active administrator and handles missing users", async () => {
    const { admin, agent, csrfToken } = await createAdminAndLogin();

    const conflict = await agent
      .post(`/admin/users/${admin.id}/deactivate`)
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("active_admin_required");
    expect(await countAuditLogs("user.deactivated", admin.id)).toBe(0);

    const missing = await agent.get("/admin/users/999999999");
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("not_found");
  });
});
