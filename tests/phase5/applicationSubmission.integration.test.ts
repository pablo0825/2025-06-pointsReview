import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "../../src/auth/password";
import { createApp } from "../../src/app";
import { closePool, pool } from "../../src/db/pool";
import type { PrivateFileStorage } from "../../src/files/privateFileStorage";
import { createApplicationSubmissionSchema } from "../../src/schemas/applicationSubmission.schema";
import { ApplicationSubmissionService } from "../../src/services/applicationSubmission.service";
import { createAuthTestUser, resetAuthTestData } from "../helpers/auth";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
let passwordHash: string;
let storageRoot: string;

async function resetSubmissionData() {
  await pool.query("UPDATE point_applications SET current_version_id = NULL");
  await pool.query("DELETE FROM application_attachments");
  await pool.query("DELETE FROM project_participation_salary_items");
  await pool.query("DELETE FROM competition_application_details");
  await pool.query("DELETE FROM project_participation_details");
  await pool.query("DELETE FROM certificate_application_details");
  await pool.query("DELETE FROM external_exhibition_details");
  await pool.query("DELETE FROM application_participants");
  await pool.query("DELETE FROM email_tasks");
  await pool.query("DELETE FROM application_versions");
  await pool.query("DELETE FROM point_applications");
  await resetAuthTestData();
}

async function createAvailableAdvisor() {
  const user = await createAuthTestUser({
    displayName: "送件測試老師",
    email: "advisor@phase5-submission.test",
    passwordHash,
    role: "advisor",
  });
  const result = await pool.query<{ id: string }>(
    `INSERT INTO advisors
      (user_id, employee_number, name, title_code, department)
     VALUES ($1, 'PHASE5001', '送件測試老師', 6, '多媒體設計系')
     RETURNING id::text`,
    [user.id],
  );
  return Number(result.rows[0].id);
}

function participant(points: string) {
  return {
    academicYear: "114",
    grade: 3,
    classNumber: 1,
    studentNumber: "4A0X0001",
    studentName: "王小明",
    requestedPoints: points,
    isApplicant: true,
  };
}

function common(advisorId: number, points: string, attachmentType: string) {
  return {
    advisorId,
    applicant: {
      name: "王小明",
      email: "student@example.com",
      phone: "0912345678",
    },
    participants: [participant(points)],
    attachments: [
      {
        clientFileKey: "proof-1",
        attachmentType,
        attachmentTypeOther: null,
        description: "證明文件",
      },
    ],
  };
}

function payloads(advisorId: number) {
  return [
    {
      ...common(advisorId, "0.50", "finalist_or_award_certificate"),
      applicationType: "competition",
      typeDetails: {
        competitionLevel: "other",
        competitionLevelOther: "其他等級",
        award: "finalist",
        awardOther: null,
        competitionName: "測試競賽",
        competitionCategory: "遊戲設計組",
        competitionDate: "2026-07-01",
      },
      detailTable: "competition_application_details",
    },
    {
      ...common(advisorId, "9.99", "salary_proof"),
      applicationType: "project_participation",
      typeDetails: {
        projectName: "測試計畫",
        principalInvestigator: "陳教授",
        workDescription: "協助開發",
        salaryItems: [{ salaryMonth: "2026-07-01", salaryAmount: 1000 }],
      },
      detailTable: "project_participation_details",
    },
    {
      ...common(advisorId, "9.99", "certificate_copy"),
      applicationType: "certificate",
      typeDetails: {
        certificateName: "ACP",
        certificateIssuer: "Adobe",
        certificateNumber: "ACP-1",
        certificateDate: "2026-07-01",
      },
      detailTable: "certificate_application_details",
    },
    {
      ...common(advisorId, "0.50", "exhibition_photo"),
      applicationType: "external_exhibition",
      typeDetails: {
        exhibitionType: "fan_work",
        workName: "作品",
        exhibitionName: "campus_exhibition",
        exhibitionNameOther: null,
        organizer: "主辦單位",
        venue: "展場",
        startDate: "2026-07-01",
        endDate: "2026-07-02",
      },
      detailTable: "external_exhibition_details",
    },
  ];
}

describe.sequential("Phase 5 public application submission", () => {
  beforeAll(async () => {
    passwordHash = await hashPassword("phase-5-submission-password");
    storageRoot = await mkdtemp(path.join(os.tmpdir(), "phase5-files-"));
    process.env.PRIVATE_FILE_STORAGE_ROOT = storageRoot;
  });
  beforeEach(resetSubmissionData);
  afterAll(async () => {
    await resetSubmissionData();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.PRIVATE_FILE_STORAGE_ROOT;
    await closePool();
  });

  it("submits all four application types with version, attachment, and email tasks", async () => {
    const advisorId = await createAvailableAdvisor();
    const app = createApp();

    for (const { detailTable, ...payload } of payloads(advisorId)) {
      const response = await request(app)
        .post("/public/applications")
        .field("payload", JSON.stringify(payload))
        .attach("attachments[proof-1]", PDF, {
          filename: "proof.pdf",
          contentType: "application/pdf",
        });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body.data).toMatchObject({
        status: "pending_advisor",
      });

      const application = await pool.query<{
        id: string;
        current_version_id: string;
        requested_total_points: string;
      }>(
        `SELECT id::text, current_version_id::text, requested_total_points
         FROM point_applications WHERE public_id = $1`,
        [response.body.data.publicId],
      );
      expect(application.rows).toHaveLength(1);
      const applicationId = application.rows[0].id;
      expect(
        Number(application.rows[0].requested_total_points),
      ).toBeGreaterThan(0);

      const counts = await pool.query<{
        participants: string;
        versions: string;
        attachments: string;
        emails: string;
        details: string;
      }>(
        `SELECT
          (SELECT COUNT(*) FROM application_participants WHERE application_id = $1)::text AS participants,
          (SELECT COUNT(*) FROM application_versions WHERE application_id = $1)::text AS versions,
          (SELECT COUNT(*) FROM application_attachments WHERE application_id = $1)::text AS attachments,
          (SELECT COUNT(*) FROM email_tasks WHERE application_id = $1)::text AS emails,
          (SELECT COUNT(*) FROM ${detailTable} WHERE application_id = $1)::text AS details`,
        [applicationId],
      );
      expect(counts.rows[0]).toEqual({
        participants: "1",
        versions: "1",
        attachments: "1",
        emails: "4",
        details: "1",
      });

      const emailTasks = await pool.query<{
        event_key: string;
        payload: Record<string, unknown>;
      }>(
        "SELECT event_key, payload FROM email_tasks WHERE application_id = $1 ORDER BY event_key",
        [applicationId],
      );
      expect(emailTasks.rows.map((task) => task.event_key)).toEqual([
        `advisor-sign-reminder-1:application-${applicationId}:version-1`,
        `advisor-sign-reminder-2:application-${applicationId}:version-1`,
        `advisor-sign-reminder-3:application-${applicationId}:version-1`,
        `advisor-sign-request:application-${applicationId}:version-1`,
      ]);
      expect(emailTasks.rows[0].payload).toMatchObject({
        advisorDisplayName: "送件測試老師",
        applicationPublicId: response.body.data.publicId,
        applicationType: payload.applicationType,
      });
      expect(emailTasks.rows[0].payload).toHaveProperty(
        "advisorConfirmationExpiresAt",
      );
      expect(emailTasks.rows[0].payload).toHaveProperty("advisorReviewUrl");

      const version = await pool.query<{
        application_snapshot: Record<string, unknown>;
      }>(
        "SELECT application_snapshot FROM application_versions WHERE id = $1",
        [application.rows[0].current_version_id],
      );
      expect(version.rows[0].application_snapshot).not.toHaveProperty(
        "attachments",
      );
      expect(version.rows[0].application_snapshot).toMatchObject({
        applicationType: payload.applicationType,
        requestedTotalPoints: application.rows[0].requested_total_points,
      });
      const attachment = await pool.query<{ storage_key: string }>(
        "SELECT storage_key FROM application_attachments WHERE application_id = $1",
        [applicationId],
      );
      expect(
        await import("node:fs/promises").then((fs) =>
          fs.stat(path.join(storageRoot, attachment.rows[0].storage_key)),
        ),
      ).toBeTruthy();
    }
  });

  it("rejects invalid file content and leaves no application rows", async () => {
    const advisorId = await createAvailableAdvisor();
    const { detailTable: _detailTable, ...payload } = payloads(advisorId)[2];
    const response = await request(createApp())
      .post("/public/applications")
      .field("payload", JSON.stringify(payload))
      .attach("attachments[proof-1]", Buffer.from("not-a-pdf"), {
        filename: "proof.pdf",
        contentType: "application/pdf",
      });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("file_type_not_allowed");
    expect(
      Number(
        (await pool.query("SELECT COUNT(*) AS count FROM point_applications"))
          .rows[0].count,
      ),
    ).toBe(0);
  });

  it("enforces multipart file size and count limits", async () => {
    const advisorId = await createAvailableAdvisor();
    const { detailTable: _detailTable, ...payload } = payloads(advisorId)[2];
    const oversized = await request(createApp())
      .post("/public/applications")
      .field("payload", JSON.stringify(payload))
      .attach("attachments[proof-1]", Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "proof.pdf",
        contentType: "application/pdf",
      });
    expect(oversized.status).toBe(400);
    expect(oversized.body.code).toBe("file_too_large");

    let tooManyRequest = request(createApp())
      .post("/public/applications")
      .field("payload", JSON.stringify(payload));
    for (let index = 0; index < 11; index += 1) {
      tooManyRequest = tooManyRequest.attach(
        `attachments[file-${index}]`,
        PDF,
        {
          filename: `proof-${index}.pdf`,
          contentType: "application/pdf",
        },
      );
    }
    const tooMany = await tooManyRequest;
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.code).toBe("too_many_files");
    expect(
      Number(
        (await pool.query("SELECT COUNT(*) AS count FROM point_applications"))
          .rows[0].count,
      ),
    ).toBe(0);
  });

  it("rolls back database work and removes saved keys when storage fails", async () => {
    const advisorId = await createAvailableAdvisor();
    const sourceDirectory = await mkdtemp(
      path.join(os.tmpdir(), "phase5-source-"),
    );
    const firstPath = path.join(sourceDirectory, "first.pdf");
    const secondPath = path.join(sourceDirectory, "second.pdf");
    await writeFile(firstPath, PDF);
    await writeFile(secondPath, PDF);
    const { detailTable: _detailTable, ...base } = payloads(advisorId)[0];
    const parsed = createApplicationSubmissionSchema.parse({
      ...base,
      attachments: [
        base.attachments[0],
        {
          clientFileKey: "extra",
          attachmentType: "other",
          attachmentTypeOther: "補充資料",
          description: null,
        },
      ],
    });
    const files = new Map<string, Express.Multer.File>([
      [
        "proof-1",
        {
          path: firstPath,
          originalname: "first.pdf",
          mimetype: "application/pdf",
          size: PDF.length,
        } as Express.Multer.File,
      ],
      [
        "extra",
        {
          path: secondPath,
          originalname: "second.pdf",
          mimetype: "application/pdf",
          size: PDF.length,
        } as Express.Multer.File,
      ],
    ]);
    const removed: string[] = [];
    let saves = 0;
    const failingStorage: PrivateFileStorage = {
      async saveFromPath(storageKey) {
        saves += 1;
        if (saves === 2) throw new Error("simulated storage failure");
        return { storageKey, fileSize: PDF.length };
      },
      async remove(storageKey) {
        removed.push(storageKey);
      },
    };

    await expect(
      ApplicationSubmissionService.submitApplication(
        parsed,
        files,
        failingStorage,
      ),
    ).rejects.toThrow("simulated storage failure");
    expect(removed).toHaveLength(1);
    expect(
      Number(
        (await pool.query("SELECT COUNT(*) AS count FROM point_applications"))
          .rows[0].count,
      ),
    ).toBe(0);
    await rm(sourceDirectory, { recursive: true, force: true });
  });
});
