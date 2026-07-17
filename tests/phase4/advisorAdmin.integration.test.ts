import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "../../src/auth/password";
import { createApp } from "../../src/app";
import { closePool, pool } from "../../src/db/pool";
import type { AuthTestUser } from "../helpers/auth";
import { createAuthTestUser, resetAuthTestData } from "../helpers/auth";

const TEST_PASSWORD = "phase-4-advisor-admin-password";
let passwordHash: string;

interface AdvisorTestRecord {
  id: string;
  user: AuthTestUser;
}

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
    email: "admin@advisor-phase4.test",
    passwordHash,
    role: "admin",
  });
  const auth = await login(admin.email);

  return { admin, ...auth };
}

async function createAdvisor(options: {
  employeeNumber: string;
  name?: string;
  advisorIsActive?: boolean;
  accountIsActive?: boolean;
  isDirector?: boolean;
}): Promise<AdvisorTestRecord> {
  const user = await createAuthTestUser({
    displayName: options.name ?? "測試老師",
    email: `${options.employeeNumber.toLowerCase()}@advisor-phase4.test`,
    passwordHash,
    role: "advisor",
    isActive: options.accountIsActive,
  });
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO advisors (
        user_id,
        employee_number,
        name,
        title_code,
        department,
        is_active,
        is_director
      )
      VALUES ($1, $2, $3, 6, '多媒體設計系', $4, $5)
      RETURNING id::text
    `,
    [
      user.id,
      options.employeeNumber,
      options.name ?? "測試老師",
      options.advisorIsActive ?? true,
      options.isDirector ?? false,
    ],
  );

  return { id: result.rows[0].id, user };
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

describe.sequential("Phase 4.1 advisor administration API", () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(TEST_PASSWORD);
  });

  beforeEach(resetAuthTestData);

  afterAll(async () => {
    await resetAuthTestData();
    await closePool();
  });

  it("lists, filters, and paginates advisors with account status", async () => {
    const { agent } = await createAdminAndLogin();
    const first = await createAdvisor({
      employeeNumber: "T001",
      name: "王老師",
    });
    const second = await createAdvisor({
      employeeNumber: "T002",
      name: "林老師",
      accountIsActive: false,
    });

    const listResponse = await agent.get(
      "/admin/advisors?page=1&pageSize=1&isActive=true",
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.pagination).toEqual({
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
    expect(listResponse.body.data[0]).toMatchObject({
      id: Number(second.id),
      userId: Number(second.user.id),
      employeeNumber: "T002",
      name: "林老師",
      titleCode: 6,
      department: "多媒體設計系",
      isActive: true,
      isDirector: false,
      account: {
        email: second.user.email,
        isActive: false,
      },
    });

    const filtered = await agent.get(
      "/admin/advisors?keyword=T001&isDirector=false",
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].id).toBe(Number(first.id));
  });

  it("requires authentication and administrator permissions", async () => {
    const unauthenticated = await request(createApp()).get("/admin/advisors");
    expect(unauthenticated.status).toBe(401);

    const reviewer = await createAuthTestUser({
      email: "reviewer@advisor-phase4.test",
      passwordHash,
      role: "reviewer",
    });
    const target = await createAdvisor({ employeeNumber: "T001" });
    const { agent, csrfToken } = await login(reviewer.email);

    const forbiddenList = await agent.get("/admin/advisors");
    expect(forbiddenList.status).toBe(403);

    const forbiddenAssign = await agent
      .post(`/admin/advisors/${target.id}/assign-director`)
      .set("X-CSRF-Token", csrfToken)
      .send({ reason: "不應允許" });
    expect(forbiddenAssign.status).toBe(403);
    expect(forbiddenAssign.body.code).toBe("forbidden");
  });

  it("updates advisor fields and maps duplicate employee numbers", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    const target = await createAdvisor({ employeeNumber: "T001" });
    await createAdvisor({ employeeNumber: "T002" });

    const response = await agent
      .patch(`/admin/advisors/${target.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "更新老師",
        titleCode: 7,
        department: "視覺傳達設計系",
      });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: Number(target.id),
      employeeNumber: "T001",
      name: "更新老師",
      titleCode: 7,
      department: "視覺傳達設計系",
    });
    expect(await countAuditLogs("advisor.updated", target.id)).toBe(1);

    const repeated = await agent
      .patch(`/admin/advisors/${target.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "更新老師",
        titleCode: 7,
        department: "視覺傳達設計系",
      });
    expect(repeated.status).toBe(200);
    expect(await countAuditLogs("advisor.updated", target.id)).toBe(1);

    const duplicate = await agent
      .patch(`/admin/advisors/${target.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ employeeNumber: "T002" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("employee_number_already_exists");
  });

  it("validates CSRF and advisor update input", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    const target = await createAdvisor({ employeeNumber: "T001" });

    const missingCsrf = await agent
      .patch(`/admin/advisors/${target.id}`)
      .send({ name: "不能更新" });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.code).toBe("csrf_token_invalid");

    const invalidTitle = await agent
      .patch(`/admin/advisors/${target.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ titleCode: 8 });
    expect(invalidTitle.status).toBe(422);
    expect(invalidTitle.body.code).toBe("validation_failed");
  });

  it("activates and deactivates non-directors idempotently", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    const inactive = await createAdvisor({
      employeeNumber: "T001",
      advisorIsActive: false,
    });
    const active = await createAdvisor({ employeeNumber: "T002" });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const activateResponse = await agent
        .post(`/admin/advisors/${inactive.id}/activate`)
        .set("X-CSRF-Token", csrfToken)
        .send({});
      expect(activateResponse.status).toBe(200);

      const deactivateResponse = await agent
        .post(`/admin/advisors/${active.id}/deactivate`)
        .set("X-CSRF-Token", csrfToken)
        .send({ reason: "暫停列入選單" });
      expect(deactivateResponse.status).toBe(200);
    }

    expect(await countAuditLogs("advisor.activated", inactive.id)).toBe(1);
    expect(await countAuditLogs("advisor.deactivated", active.id)).toBe(1);
  });

  it("requires director reassignment before deactivation", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    const director = await createAdvisor({
      employeeNumber: "T001",
      isDirector: true,
    });

    const response = await agent
      .post(`/admin/advisors/${director.id}/deactivate`)
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("active_director_required");
    expect(await countAuditLogs("advisor.deactivated", director.id)).toBe(0);
  });

  it("switches directors atomically and rejects inactive targets", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    const previous = await createAdvisor({
      employeeNumber: "T001",
      isDirector: true,
    });
    const target = await createAdvisor({ employeeNumber: "T002" });
    const inactive = await createAdvisor({
      employeeNumber: "T003",
      advisorIsActive: false,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await agent
        .post(`/admin/advisors/${target.id}/assign-director`)
        .set("X-CSRF-Token", csrfToken)
        .send({ reason: "主任異動" });
      expect(response.status).toBe(200);
    }

    const directorRows = await pool.query<{
      id: string;
      is_director: boolean;
    }>(
      "SELECT id::text, is_director FROM advisors WHERE id = ANY($1::bigint[]) ORDER BY id",
      [[previous.id, target.id]],
    );
    expect(directorRows.rows).toEqual([
      { id: previous.id, is_director: false },
      { id: target.id, is_director: true },
    ]);
    expect(await countAuditLogs("advisor.director_assigned", target.id)).toBe(
      1,
    );

    const audit = await pool.query<{ metadata: Record<string, unknown> }>(
      "SELECT metadata FROM audit_logs WHERE action = 'advisor.director_assigned'",
    );
    expect(audit.rows[0].metadata).toEqual({
      reason: "主任異動",
      previous_director_advisor_id: Number(previous.id),
      new_director_advisor_id: Number(target.id),
    });

    const inactiveResponse = await agent
      .post(`/admin/advisors/${inactive.id}/assign-director`)
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(inactiveResponse.status).toBe(409);
    expect(inactiveResponse.body.code).toBe("advisor_state_conflict");
  });

  it("maps active director constraint conflicts and missing advisors", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    await createAdvisor({ employeeNumber: "T001", isDirector: true });
    const inactiveDirector = await createAdvisor({
      employeeNumber: "T002",
      advisorIsActive: false,
      isDirector: true,
    });

    const conflict = await agent
      .post(`/admin/advisors/${inactiveDirector.id}/activate`)
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("active_director_conflict");

    const missing = await agent
      .post("/admin/advisors/999999999/activate")
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("not_found");
  });
});
