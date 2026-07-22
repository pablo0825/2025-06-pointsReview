import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  calculateCompetitionPoints,
  calculateExhibitionPoints,
  calculateProjectPoints,
  PointCalculationError,
} from "../../src/domain/pointCalculator";
import { LocalPrivateFileStorage } from "../../src/files/privateFileStorage";
import { createApplicationSubmissionSchema } from "../../src/schemas/applicationSubmission.schema";

const temporaryDirectories: string[] = [];

function participant(requestedPoints = "1.00") {
  return {
    academicYear: "114",
    grade: 3,
    classNumber: 1,
    studentNumber: "4A0X0001",
    studentName: "王小明",
    requestedPoints,
    isApplicant: true,
  };
}

function common() {
  return {
    advisorId: 1,
    applicant: {
      name: "王小明",
      email: "STUDENT@example.com",
      phone: "0912-345-678",
    },
    participants: [participant()],
    attachments: [
      {
        clientFileKey: "proof-1",
        attachmentType: "certificate_copy",
        attachmentTypeOther: null,
        description: null,
      },
    ],
  };
}

describe("Phase 5 application submission schema and calculations", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("parses each application branch and normalizes contact fields", () => {
    const branches = [
      {
        applicationType: "competition",
        typeDetails: {
          competitionLevel: "other",
          competitionLevelOther: "校級",
          award: "other_award",
          awardOther: "佳作",
          competitionName: "競賽",
          competitionCategory: "設計組",
          competitionDate: "2026-07-01",
        },
      },
      {
        applicationType: "project_participation",
        typeDetails: {
          projectName: "計畫",
          principalInvestigator: "主持人",
          workDescription: "工作內容",
          salaryItems: [{ salaryMonth: "2026-07-01", salaryAmount: 1000 }],
        },
      },
      {
        applicationType: "certificate",
        typeDetails: {
          certificateName: "證照",
          certificateIssuer: "機構",
          certificateNumber: "CERT-1",
          certificateDate: "2026-07-01",
        },
      },
      {
        applicationType: "external_exhibition",
        typeDetails: {
          exhibitionType: "fan_work",
          workName: "作品",
          exhibitionName: "other",
          exhibitionNameOther: "地方展",
          organizer: "主辦單位",
          venue: "展場",
          startDate: "2026-07-01",
          endDate: "2026-07-02",
        },
      },
    ];
    for (const branch of branches) {
      const parsed = createApplicationSubmissionSchema.parse({
        ...common(),
        ...branch,
      });
      expect(parsed.applicant.email).toBe("student@example.com");
    }
  });

  it("rejects duplicate identities, invalid applicant counts, other pairs, and salary months", () => {
    const result = createApplicationSubmissionSchema.safeParse({
      ...common(),
      applicationType: "project_participation",
      participants: [participant(), participant()],
      typeDetails: {
        projectName: "計畫",
        principalInvestigator: "主持人",
        workDescription: "工作",
        salaryItems: [
          { salaryMonth: "2026-07-01", salaryAmount: 1000 },
          { salaryMonth: "2026-07-01", salaryAmount: 2000 },
        ],
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toEqual(
        expect.arrayContaining([
          "participants",
          "participants.1.studentNumber",
          "typeDetails.salaryItems.1.salaryMonth",
        ]),
      );
    }
  });

  it("calculates decimal points without floating-point drift", () => {
    expect(
      calculateCompetitionPoints(
        [
          participant("0.10"),
          { ...participant("0.20"), studentNumber: "2", isApplicant: false },
        ],
        { allocationMethod: "shared_total", points: "0.30" },
      ),
    ).toBe("0.30");
    expect(
      calculateProjectPoints(5500, {
        salaryUnit: 1000,
        pointsPerUnit: "0.50",
        maximumPoints: "2.00",
      }),
    ).toBe("2.00");
    expect(
      calculateExhibitionPoints([participant("0.50")], {
        minimumPointsPerPerson: "0.50",
        maximumPointsPerPerson: "1.00",
      }),
    ).toBe("0.50");
    expect(() =>
      calculateProjectPoints(999, {
        salaryUnit: 1000,
        pointsPerUnit: "0.50",
        maximumPoints: null,
      }),
    ).toThrow(PointCalculationError);
  });

  it("stores files under the private root and rejects traversal", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "phase5-storage-"));
    temporaryDirectories.push(directory);
    const source = path.join(directory, "source.txt");
    const root = path.join(directory, "private");
    await writeFile(source, "private-content");
    const storage = new LocalPrivateFileStorage(root);

    const saved = await storage.saveFromPath(
      "attachments/app/1/file.pdf",
      source,
    );
    expect(saved.fileSize).toBe(15);
    expect(await readFile(path.join(root, saved.storageKey), "utf8")).toBe(
      "private-content",
    );
    await expect(
      storage.saveFromPath("../outside.pdf", source),
    ).rejects.toThrow();
  });
});
