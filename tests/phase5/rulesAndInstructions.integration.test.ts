import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "../../src/auth/password";
import { createApp } from "../../src/app";
import { closePool, pool } from "../../src/db/pool";
import { createAuthTestUser, resetAuthTestData } from "../helpers/auth";

const TEST_PASSWORD = "phase-5-rules-password";
const TEST_DATE = "2090-01-01";
let passwordHash: string;

async function resetPhase5Data() {
  await pool.query("DELETE FROM application_instructions");
  for (const table of [
    "competition_point_rules",
    "project_point_rules",
    "certificate_point_rules",
    "exhibition_point_rules",
    "application_type_participant_rules",
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE effective_from >= $1`, [
      TEST_DATE,
    ]);
    await pool.query(
      `UPDATE ${table} SET effective_to = NULL WHERE effective_to >= $1`,
      [TEST_DATE],
    );
  }
  await resetAuthTestData();
}

async function createAdminAndLogin() {
  const admin = await createAuthTestUser({
    displayName: "Phase 5 管理員",
    email: "admin@phase5-rules.test",
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
  return { agent, csrfToken: csrf.body.data.csrfToken as string };
}

async function countAudit(action: string, resourceId: number) {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_logs
     WHERE action = $1 AND resource_id = $2`,
    [action, String(resourceId)],
  );
  return Number(result.rows[0].count);
}

describe.sequential("Phase 5 rules and application instructions", () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(TEST_PASSWORD);
  });
  beforeEach(resetPhase5Data);
  afterAll(async () => {
    await resetPhase5Data();
    await closePool();
  });

  it("creates a point-rule successor atomically and records an audit log", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    const current = await pool.query<{ id: string }>(
      `SELECT id::text
       FROM competition_point_rules
       WHERE competition_level = 'other'
         AND award = 'finalist'
         AND effective_to IS NULL`,
    );

    const response = await agent
      .post("/admin/point-rules")
      .set("X-CSRF-Token", csrfToken)
      .send({
        applicationType: "competition",
        competitionLevel: "other",
        award: "finalist",
        allocationMethod: "per_person",
        points: "3.00",
        effectiveFrom: TEST_DATE,
        effectiveTo: null,
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      applicationType: "competition",
      points: "3.00",
      effectiveFrom: TEST_DATE,
    });
    const previous = await pool.query<{ effective_to: string | null }>(
      "SELECT effective_to FROM competition_point_rules WHERE id = $1",
      [current.rows[0].id],
    );
    expect(previous.rows[0].effective_to).toBe(TEST_DATE);
    expect(await countAudit("point_rule.created", response.body.data.id)).toBe(
      1,
    );

    const list = await agent.get(
      "/admin/point-rules?applicationType=competition&includeExpired=true",
    );
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: response.body.data.id }),
      ]),
    );
  });

  it("maps point and participant period overlaps to distinct error codes", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    await pool.query(
      `UPDATE exhibition_point_rules
       SET effective_to = '2092-01-01'
       WHERE exhibition_type = 'fan_work' AND effective_to IS NULL`,
    );
    const pointConflict = await agent
      .post("/admin/point-rules")
      .set("X-CSRF-Token", csrfToken)
      .send({
        applicationType: "external_exhibition",
        exhibitionType: "fan_work",
        minimumPointsPerPerson: "1.00",
        maximumPointsPerPerson: "3.00",
        effectiveFrom: "2091-01-01",
        effectiveTo: "2093-01-01",
      });
    expect(pointConflict.status).toBe(409);
    expect(pointConflict.body.code).toBe("point_rule_period_overlap");

    await pool.query(
      `UPDATE application_type_participant_rules
       SET effective_to = '2092-01-01'
       WHERE application_type = 'external_exhibition'
         AND effective_to IS NULL`,
    );
    const participantConflict = await agent
      .post("/admin/application-participant-rules")
      .set("X-CSRF-Token", csrfToken)
      .send({
        applicationType: "external_exhibition",
        minimumParticipants: 1,
        maximumParticipants: 8,
        effectiveFrom: "2091-01-01",
        effectiveTo: "2093-01-01",
      });
    expect(participantConflict.status).toBe(409);
    expect(participantConflict.body.code).toBe(
      "participant_rule_period_overlap",
    );
  });

  it("creates an instruction successor and protects effective content", async () => {
    const { agent, csrfToken } = await createAdminAndLogin();
    const first = await agent
      .post("/admin/application-instructions")
      .set("X-CSRF-Token", csrfToken)
      .send({
        applicationType: "competition",
        sectionKey: "eligibility",
        title: "現行辦法",
        content: "現行內容",
        displayOrder: 10,
        isVisible: true,
        effectiveFrom: "2020-01-01",
        effectiveTo: null,
      });
    expect(first.status).toBe(201);

    const successor = await agent
      .post("/admin/application-instructions")
      .set("X-CSRF-Token", csrfToken)
      .send({
        applicationType: "competition",
        sectionKey: "eligibility",
        title: "新版辦法",
        content: "新版內容",
        displayOrder: 20,
        isVisible: true,
        effectiveFrom: TEST_DATE,
        effectiveTo: null,
      });
    expect(successor.status).toBe(201);

    const stored = await pool.query<{ effective_to: string | null }>(
      "SELECT effective_to FROM application_instructions WHERE id = $1",
      [first.body.data.id],
    );
    expect(stored.rows[0].effective_to).toBe(TEST_DATE);

    const rejected = await agent
      .patch(`/admin/application-instructions/${first.body.data.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ title: "不應直接修改" });
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe(
      "application_instruction_already_effective",
    );

    const reordered = await agent
      .patch(`/admin/application-instructions/${first.body.data.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ displayOrder: 30 });
    expect(reordered.status).toBe(200);
    expect(reordered.body.data.displayOrder).toBe(30);
    expect(
      await countAudit("application_instruction.updated", first.body.data.id),
    ).toBe(1);
  });

  it("returns only eligible public advisors and currently visible instructions", async () => {
    const active = await createAuthTestUser({
      email: "active-advisor@phase5.test",
      passwordHash,
      role: "advisor",
    });
    const disabled = await createAuthTestUser({
      email: "disabled-advisor@phase5.test",
      passwordHash,
      role: "advisor",
      isActive: false,
    });
    for (const [userId, employeeNumber, name] of [
      [active.id, "P5001", "公開老師"],
      [disabled.id, "P5002", "停用老師"],
    ]) {
      await pool.query(
        `INSERT INTO advisors
          (user_id, employee_number, name, title_code, department)
         VALUES ($1, $2, $3, 6, '多媒體設計系')`,
        [userId, employeeNumber, name],
      );
    }
    await pool.query(
      `INSERT INTO application_instructions
        (application_type, section_key, title, content, display_order,
         is_visible, effective_from, effective_to)
       VALUES
        ('certificate', 'current', '現行', '現行內容', 1, TRUE,
         '2020-01-01', NULL),
        ('certificate', 'hidden', '隱藏', '隱藏內容', 2, FALSE,
         '2020-01-01', NULL),
        ('certificate', 'expired', '歷史', '歷史內容', 3, TRUE,
         '2010-01-01', '2011-01-01'),
        ('certificate', 'future', '未來', '未來內容', 4, TRUE,
         '2090-01-01', NULL)`,
    );

    const app = createApp();
    const advisors = await request(app).get("/public/advisors");
    expect(advisors.status).toBe(200);
    expect(
      advisors.body.data.map((item: { name: string }) => item.name),
    ).toEqual(["公開老師"]);

    const current = await request(app).get(
      "/public/application-instructions?applicationType=certificate",
    );
    expect(current.status).toBe(200);
    expect(
      current.body.data.map((item: { sectionKey: string }) => item.sectionKey),
    ).toEqual(["current"]);

    const historical = await request(app).get(
      "/public/application-instructions?applicationType=certificate&includeHistorical=true",
    );
    expect(
      historical.body.data.map(
        (item: { sectionKey: string }) => item.sectionKey,
      ),
    ).toEqual(["current", "expired"]);
  });

  it("requires admin permission and CSRF for rule mutations", async () => {
    const unauthenticated = await request(createApp()).get(
      "/admin/point-rules?applicationType=certificate",
    );
    expect(unauthenticated.status).toBe(401);

    const { agent } = await createAdminAndLogin();
    const missingCsrf = await agent.post("/admin/point-rules").send({
      applicationType: "certificate",
      pointsPerCertificate: "2.00",
      maximumPointsPerStudent: "4.00",
      effectiveFrom: TEST_DATE,
      effectiveTo: null,
    });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.code).toBe("csrf_token_invalid");
  });
});
