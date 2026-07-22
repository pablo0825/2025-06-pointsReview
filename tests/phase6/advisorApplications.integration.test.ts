import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "../../src/auth/password";
import { createApp } from "../../src/app";
import { closePool, pool } from "../../src/db/pool";
import type { PrivateFileStorage } from "../../src/files/privateFileStorage";
import { AdvisorApplicationService } from "../../src/services/advisorApplication.service";
import {
  createAuthTestUser,
  resetAuthTestData,
  type AuthTestUser,
} from "../helpers/auth";

const TEST_PASSWORD = "phase-6-advisor-password";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
let passwordHash: string;
let storageRoot: string;

interface AdvisorRecord {
  id: string;
  user: AuthTestUser;
}

interface ApplicationRecord {
  id: string;
  publicId: string;
  versionId: string;
}

async function resetPhase6Data() {
  await pool.query("DELETE FROM advisor_signatures");
  await pool.query("DELETE FROM application_review_actions");
  await pool.query("DELETE FROM email_tasks");
  await pool.query("DELETE FROM application_attachments");
  await pool.query("DELETE FROM application_participants");
  await pool.query("UPDATE point_applications SET current_version_id = NULL");
  await pool.query("DELETE FROM application_versions");
  await pool.query("DELETE FROM point_applications");
  await resetAuthTestData();
}

async function createAdvisor(employeeNumber: string): Promise<AdvisorRecord> {
  const user = await createAuthTestUser({
    displayName: `${employeeNumber}老師`,
    email: `${employeeNumber.toLowerCase()}@phase6.test`,
    passwordHash,
    role: "advisor",
  });
  const advisor = await pool.query<{ id: string }>(
    `INSERT INTO advisors
       (user_id, employee_number, name, title_code, department)
     VALUES ($1, $2, $3, 6, '多媒體設計系')
     RETURNING id::text`,
    [user.id, employeeNumber, user.displayName],
  );
  return { id: advisor.rows[0].id, user };
}

async function login(user: AuthTestUser) {
  const agent = request.agent(createApp());
  expect(
    (
      await agent.post("/auth/login").send({
        email: user.email,
        password: TEST_PASSWORD,
      })
    ).status,
  ).toBe(200);
  const csrf = await agent.get("/auth/csrf-token");
  return { agent, csrfToken: csrf.body.data.csrfToken as string };
}

async function createApplication(
  advisorId: string,
  options: {
    status?: "pending_advisor" | "under_review" | "rejected";
    submittedAt?: Date;
    expiresAt?: Date;
    applicantName?: string;
  } = {},
): Promise<ApplicationRecord> {
  const status = options.status ?? "pending_advisor";
  const submittedAt = options.submittedAt ?? new Date();
  const expiresAt =
    options.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const rule = await pool.query<{ id: string }>(
    `SELECT id::text FROM application_type_participant_rules
     WHERE application_type = 'competition'
     ORDER BY id LIMIT 1`,
  );
  const application = await pool.query<{ id: string; public_id: string }>(
    `INSERT INTO point_applications
       (application_type, status, advisor_id, application_participant_rule_id,
        applicant_name, applicant_email, applicant_phone, requested_total_points,
        advisor_confirmation_expires_at, submitted_at, closed_at)
     VALUES ('competition', $1, $2, $3, $4, 'student@example.com',
             '0912345678', 10, $5, $6, $7)
     RETURNING id::text, public_id::text`,
    [
      status,
      advisorId,
      rule.rows[0].id,
      options.applicantName ?? "王小明",
      expiresAt,
      submittedAt,
      status === "rejected" ? new Date() : null,
    ],
  );
  const snapshot = {
    applicationType: "competition",
    advisorId: Number(advisorId),
    applicant: {
      name: options.applicantName ?? "王小明",
      email: "student@example.com",
      phone: "0912345678",
    },
    participants: [
      {
        academicYear: "114",
        grade: 3,
        classNumber: 1,
        studentNumber: "4A0X0001",
        studentName: options.applicantName ?? "王小明",
        requestedPoints: "10.00",
        isApplicant: true,
      },
    ],
    typeDetails: { competitionName: "Phase 6 測試競賽" },
    requestedTotalPoints: "10.00",
  };
  const version = await pool.query<{ id: string }>(
    `INSERT INTO application_versions
       (application_id, version_number, application_snapshot)
     VALUES ($1, 1, $2::jsonb) RETURNING id::text`,
    [application.rows[0].id, JSON.stringify(snapshot)],
  );
  await pool.query(
    "UPDATE point_applications SET current_version_id = $2 WHERE id = $1",
    [application.rows[0].id, version.rows[0].id],
  );
  await pool.query(
    `INSERT INTO application_participants
       (application_id, academic_year, grade, class_number, student_number,
        student_name, requested_points, is_applicant)
     VALUES ($1, '114', 3, 1, '4A0X0001', $2, 10, TRUE)`,
    [application.rows[0].id, options.applicantName ?? "王小明"],
  );
  for (const [index, templateName] of [
    "advisor_sign_request",
    "advisor_sign_reminder_1",
    "advisor_sign_reminder_2",
    "advisor_sign_reminder_3",
  ].entries()) {
    const label = index === 0 ? "request" : `reminder-${index}`;
    await pool.query(
      `INSERT INTO email_tasks
         (event_key, application_id, recipient_email, template_name, payload,
          scheduled_at)
       VALUES ($1, $2, 'advisor@example.com', $3, '{}'::jsonb, NOW())`,
      [
        `advisor-sign-${label}:application-${application.rows[0].id}:version-1`,
        application.rows[0].id,
        templateName,
      ],
    );
  }
  return {
    id: application.rows[0].id,
    publicId: application.rows[0].public_id,
    versionId: version.rows[0].id,
  };
}

describe.sequential("Phase 6 advisor application API", () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(TEST_PASSWORD);
    storageRoot = await mkdtemp(path.join(os.tmpdir(), "phase6-signatures-"));
    process.env.PRIVATE_FILE_STORAGE_ROOT = storageRoot;
  });
  beforeEach(resetPhase6Data);
  afterAll(async () => {
    await resetPhase6Data();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.PRIVATE_FILE_STORAGE_ROOT;
    await closePool();
  });

  it("lists only the current advisor pending applications with pagination and order", async () => {
    const advisor = await createAdvisor("P6001");
    const other = await createAdvisor("P6002");
    const older = await createApplication(advisor.id, {
      submittedAt: new Date("2026-07-01T00:00:00Z"),
      applicantName: "較早申請",
    });
    const newer = await createApplication(advisor.id, {
      submittedAt: new Date("2026-07-02T00:00:00Z"),
      applicantName: "較新申請",
    });
    await createApplication(other.id);
    await createApplication(advisor.id, { status: "under_review" });
    const { agent } = await login(advisor.user);

    const response = await agent.get(
      "/advisor/applications/pending?page=1&pageSize=1",
    );
    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
    expect(response.body.data[0].publicId).toBe(newer.publicId);
    expect(response.body.data[0].publicId).not.toBe(older.publicId);
  });

  it("returns pending detail without storage keys and hides other advisors applications", async () => {
    const advisor = await createAdvisor("P6001");
    const other = await createAdvisor("P6002");
    const own = await createApplication(advisor.id);
    const foreign = await createApplication(other.id);
    const { agent } = await login(advisor.user);

    const detail = await agent.get(
      `/advisor/applications/pending/${own.publicId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data.application).toMatchObject({
      publicId: own.publicId,
      status: "pending_advisor",
      participants: [{ studentNumber: "4A0X0001" }],
      typeDetails: { competitionName: "Phase 6 測試競賽" },
      currentVersion: { versionNumber: 1 },
    });
    expect(JSON.stringify(detail.body)).not.toContain("storageKey");
    expect(
      (await agent.get(`/advisor/applications/pending/${foreign.publicId}`))
        .status,
    ).toBe(404);
  });

  it("separates history from pending and supports history filters and detail", async () => {
    const advisor = await createAdvisor("P6001");
    const pending = await createApplication(advisor.id);
    const history = await createApplication(advisor.id, {
      status: "under_review",
      submittedAt: new Date("2026-07-03T00:00:00Z"),
    });
    await pool.query(
      `INSERT INTO application_review_actions
         (application_id, actor_user_id, actor_type, action_type, metadata,
          ip_address, user_agent)
       VALUES ($1, $2, 'advisor', 'advisor_approved', '{"versionNumber":1}',
               '127.0.0.1', 'test')`,
      [history.id, advisor.user.id],
    );
    await pool.query(
      `INSERT INTO advisor_signatures
         (application_version_id, advisor_user_id, signature_storage_key,
          signed_at, ip_address, user_agent)
       VALUES ($1, $2, 'private/secret.png', NOW(), '127.0.0.1', 'test')`,
      [history.versionId, advisor.user.id],
    );
    const { agent } = await login(advisor.user);

    const list = await agent.get(
      "/advisor/applications/history?status=under_review&applicationType=competition",
    );
    expect(list.status).toBe(200);
    expect(
      list.body.data.map((item: { publicId: string }) => item.publicId),
    ).toEqual([history.publicId]);
    expect(list.body.data[0].publicId).not.toBe(pending.publicId);

    const detail = await agent.get(
      `/advisor/applications/history/${history.publicId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data.application.versions).toHaveLength(1);
    expect(detail.body.data.application.advisorReviewActions).toHaveLength(1);
    expect(detail.body.data.application.advisorSignatures[0]).toMatchObject({
      versionNumber: 1,
      isValid: true,
    });
    expect(JSON.stringify(detail.body)).not.toContain("secret.png");
  });

  it("requires authentication, advisor permission, and CSRF", async () => {
    const advisor = await createAdvisor("P6001");
    const application = await createApplication(advisor.id);
    expect(
      (await request(createApp()).get("/advisor/applications/pending")).status,
    ).toBe(401);
    const reviewer = await createAuthTestUser({
      email: "reviewer@phase6.test",
      passwordHash,
      role: "reviewer",
    });
    const reviewerAuth = await login(reviewer);
    expect(
      (await reviewerAuth.agent.get("/advisor/applications/pending")).status,
    ).toBe(403);
    const advisorAuth = await login(advisor.user);
    const noCsrf = await advisorAuth.agent
      .post(`/advisor/applications/pending/${application.publicId}/reject`)
      .send({ reason: "拒絕" });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.code).toBe("csrf_token_invalid");
  });

  it("approves the confirmed version, stores the signature, and cancels pending notifications", async () => {
    const advisor = await createAdvisor("P6001");
    const application = await createApplication(advisor.id);
    const { agent, csrfToken } = await login(advisor.user);
    const response = await agent
      .post(`/advisor/applications/pending/${application.publicId}/approve`)
      .set("X-CSRF-Token", csrfToken)
      .field("payload", JSON.stringify({ confirmVersionNumber: 1 }))
      .attach("signature", PNG, {
        filename: "signature.png",
        contentType: "image/png",
      });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.status).toBe("under_review");

    const state = await pool.query<{
      status: string;
      signatures: string;
      actions: string;
      cancelled: string;
    }>(
      `SELECT pa.status,
        (SELECT COUNT(*) FROM advisor_signatures s WHERE s.application_version_id = $2)::text AS signatures,
        (SELECT COUNT(*) FROM application_review_actions a WHERE a.application_id = $1 AND a.action_type = 'advisor_approved')::text AS actions,
        (SELECT COUNT(*) FROM email_tasks e WHERE e.application_id = $1 AND e.status = 'cancelled')::text AS cancelled
       FROM point_applications pa WHERE pa.id = $1`,
      [application.id, application.versionId],
    );
    expect(state.rows[0]).toEqual({
      status: "under_review",
      signatures: "1",
      actions: "1",
      cancelled: "4",
    });
    const signature = await pool.query<{ signature_storage_key: string }>(
      "SELECT signature_storage_key FROM advisor_signatures WHERE application_version_id = $1",
      [application.versionId],
    );
    await expect(
      import("node:fs/promises").then((fs) =>
        fs.stat(
          path.join(storageRoot, signature.rows[0].signature_storage_key),
        ),
      ),
    ).resolves.toBeTruthy();
  });

  it("rejects with a reason, closes the application, and creates applicant email", async () => {
    const advisor = await createAdvisor("P6001");
    const application = await createApplication(advisor.id);
    const { agent, csrfToken } = await login(advisor.user);
    const response = await agent
      .post(`/advisor/applications/pending/${application.publicId}/reject`)
      .set("X-CSRF-Token", csrfToken)
      .send({ reason: "內容與實際指導不符" });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("rejected");
    const state = await pool.query<{
      status: string;
      closed_at: Date;
      reason: string;
      rejected_emails: string;
    }>(
      `SELECT pa.status, pa.closed_at, ara.reason,
        (SELECT COUNT(*) FROM email_tasks e WHERE e.application_id = pa.id AND e.template_name = 'application_rejected')::text AS rejected_emails
       FROM point_applications pa
       JOIN application_review_actions ara ON ara.application_id = pa.id
       WHERE pa.id = $1 AND ara.action_type = 'advisor_rejected'`,
      [application.id],
    );
    expect(state.rows[0]).toMatchObject({
      status: "rejected",
      reason: "內容與實際指導不符",
      rejected_emails: "1",
    });
    expect(state.rows[0].closed_at).toBeInstanceOf(Date);
  });

  it("validates ownership, state, deadline, version, and reject reason", async () => {
    const advisor = await createAdvisor("P6001");
    const other = await createAdvisor("P6002");
    const foreign = await createApplication(other.id);
    const stale = await createApplication(advisor.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const conflict = await createApplication(advisor.id, {
      status: "under_review",
    });
    const { agent, csrfToken } = await login(advisor.user);
    const approve = (publicId: string, version = 1) =>
      agent
        .post(`/advisor/applications/pending/${publicId}/approve`)
        .set("X-CSRF-Token", csrfToken)
        .field("payload", JSON.stringify({ confirmVersionNumber: version }))
        .attach("signature", PNG, {
          filename: "signature.png",
          contentType: "image/png",
        });
    expect((await approve(foreign.publicId)).status).toBe(404);
    expect((await approve(conflict.publicId)).body.code).toBe(
      "application_status_conflict",
    );
    expect((await approve(stale.publicId)).body.code).toBe(
      "advisor_confirmation_expired",
    );
    const staleReject = await agent
      .post(`/advisor/applications/pending/${stale.publicId}/reject`)
      .set("X-CSRF-Token", csrfToken)
      .send({ reason: "期限後不可拒絕" });
    expect(staleReject.body.code).toBe("advisor_confirmation_expired");
    const current = await createApplication(advisor.id);
    expect((await approve(current.publicId, 2)).body.code).toBe(
      "application_version_conflict",
    );
    const missingReason = await agent
      .post(`/advisor/applications/pending/${current.publicId}/reject`)
      .set("X-CSRF-Token", csrfToken)
      .send({ reason: "" });
    expect(missingReason.status).toBe(422);

    const alreadySigned = await createApplication(advisor.id);
    await pool.query(
      `INSERT INTO advisor_signatures
         (application_version_id, advisor_user_id, signature_storage_key,
          signed_at, ip_address, user_agent)
       VALUES ($1, $2, 'existing.png', NOW(), '127.0.0.1', 'test')`,
      [alreadySigned.versionId, advisor.user.id],
    );
    expect((await approve(alreadySigned.publicId)).body.code).toBe(
      "application_status_conflict",
    );
  });

  it("rejects missing, oversized, non-PNG, and over-dimension signatures", async () => {
    const advisor = await createAdvisor("P6001");
    const application = await createApplication(advisor.id);
    const { agent, csrfToken } = await login(advisor.user);
    const endpoint = `/advisor/applications/pending/${application.publicId}/approve`;
    const missing = await agent
      .post(endpoint)
      .set("X-CSRF-Token", csrfToken)
      .field("payload", JSON.stringify({ confirmVersionNumber: 1 }));
    expect(missing.body.code).toBe("file_missing");
    const wrongType = await agent
      .post(endpoint)
      .set("X-CSRF-Token", csrfToken)
      .field("payload", JSON.stringify({ confirmVersionNumber: 1 }))
      .attach("signature", Buffer.from("not png"), {
        filename: "signature.png",
        contentType: "image/png",
      });
    expect(wrongType.body.code).toBe("file_type_not_allowed");
    const oversized = await agent
      .post(endpoint)
      .set("X-CSRF-Token", csrfToken)
      .field("payload", JSON.stringify({ confirmVersionNumber: 1 }))
      .attach("signature", Buffer.alloc(1024 * 1024 + 1), {
        filename: "signature.png",
        contentType: "image/png",
      });
    expect(oversized.body.code).toBe("file_too_large");
    const wide = Buffer.from(PNG);
    wide.writeUInt32BE(1601, 16);
    const dimension = await agent
      .post(endpoint)
      .set("X-CSRF-Token", csrfToken)
      .field("payload", JSON.stringify({ confirmVersionNumber: 1 }))
      .attach("signature", wide, {
        filename: "signature.png",
        contentType: "image/png",
      });
    expect(dimension.status).toBe(422);
    expect(dimension.body.code).toBe("validation_failed");
  });

  it("rolls back database changes and removes the signature when approval fails", async () => {
    const advisor = await createAdvisor("P6001");
    const application = await createApplication(advisor.id);
    const removed: string[] = [];
    const storage: PrivateFileStorage = {
      async saveFromPath(storageKey) {
        await pool.query("DELETE FROM application_versions WHERE id = -1");
        return { storageKey, fileSize: PNG.length };
      },
      async remove(storageKey) {
        removed.push(storageKey);
      },
    };
    await pool.query(
      `CREATE OR REPLACE FUNCTION phase6_fail_action() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'phase6 forced failure'; END; $$ LANGUAGE plpgsql`,
    );
    await pool.query(
      `CREATE TRIGGER phase6_fail_action BEFORE INSERT ON application_review_actions
       FOR EACH ROW EXECUTE FUNCTION phase6_fail_action()`,
    );
    try {
      await expect(
        AdvisorApplicationService.approve(
          application.publicId,
          { confirmVersionNumber: 1 },
          {
            temporaryPath: "unused",
            fileSize: PNG.length,
            width: 1,
            height: 1,
          },
          {
            userId: advisor.user.id,
            ipAddress: "127.0.0.1",
            userAgent: "test",
          },
          storage,
        ),
      ).rejects.toThrow("phase6 forced failure");
    } finally {
      await pool.query(
        "DROP TRIGGER IF EXISTS phase6_fail_action ON application_review_actions",
      );
      await pool.query("DROP FUNCTION IF EXISTS phase6_fail_action()");
    }
    expect(removed).toHaveLength(1);
    expect(
      (
        await pool.query(
          "SELECT status FROM point_applications WHERE id = $1",
          [application.id],
        )
      ).rows[0].status,
    ).toBe("pending_advisor");
    expect(
      Number(
        (await pool.query("SELECT COUNT(*) AS count FROM advisor_signatures"))
          .rows[0].count,
      ),
    ).toBe(0);
  });
});
