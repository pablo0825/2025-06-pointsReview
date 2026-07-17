import { execFile } from "node:child_process";
import { promisify } from "node:util";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { verifyPassword } from "../../src/auth/password";
import { createApp } from "../../src/app";
import { closePool, pool } from "../../src/db/pool";
import { getTestDatabaseUrl } from "../helpers/database";

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const seedEmails = [
  "admin@example.test",
  "reviewer@example.test",
  "advisor@example.test",
];

async function runSeed(
  environment: "development" | "test",
  nodeEnv = "test",
) {
  return execFileAsync(
    process.execPath,
    ["-r", "dotenv/config", "scripts/run-seed.js", environment],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: nodeEnv,
        DATABASE_URL: getTestDatabaseUrl(),
      },
    },
  );
}

async function resetSeedAccounts(): Promise<void> {
  await pool.query("DELETE FROM user_sessions");
  await pool.query("DELETE FROM advisors");
  await pool.query("DELETE FROM users WHERE email = ANY($1::text[])", [
    seedEmails,
  ]);

  const seedRunsTable = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass('public.seed_runs') IS NOT NULL AS exists",
  );

  if (seedRunsTable.rows[0].exists) {
    await pool.query(
      "DELETE FROM seed_runs WHERE file_name = '001_seed_accounts.sql'",
    );
  }
}

describe.sequential("Phase 4.1 account seeds", () => {
  beforeEach(resetSeedAccounts);

  afterAll(async () => {
    await resetSeedAccounts();
    await closePool();
  });

  it.each(["development", "test"] as const)(
    "creates deterministic %s accounts and is repeatable",
    async (environment) => {
      const firstRun = await runSeed(environment);
      const secondRun = await runSeed(environment);

      expect(firstRun.stdout).toContain(
        `Ran ${environment}/001_seed_accounts.sql`,
      );
      expect(secondRun.stdout).toContain(
        `Skipped ${environment}/001_seed_accounts.sql`,
      );

      const users = await pool.query<{
        email: string;
        password_hash: string;
        role: string;
        is_active: boolean;
        activated_at: Date | null;
      }>(
        `
          SELECT email, password_hash, role, is_active, activated_at
          FROM users
          WHERE email = ANY($1::text[])
          ORDER BY role
        `,
        [seedEmails],
      );

      expect(users.rows).toHaveLength(3);
      expect(users.rows.map((user) => user.role).sort()).toEqual([
        "admin",
        "advisor",
        "reviewer",
      ]);

      for (const user of users.rows) {
        expect(user.is_active).toBe(true);
        expect(user.activated_at).toBeInstanceOf(Date);
        expect(user.password_hash).toMatch(/^\$argon2id\$/);
        expect(user.password_hash).not.toContain("PointsReview-Dev-2026!");
        await expect(
          verifyPassword("PointsReview-Dev-2026!", user.password_hash),
        ).resolves.toBe(true);

        const loginResponse = await request(createApp())
          .post("/auth/login")
          .send({
            email: user.email,
            password: "PointsReview-Dev-2026!",
          });
        expect(loginResponse.status).toBe(200);
        expect(loginResponse.body.data.user).toMatchObject({
          email: user.email,
          role: user.role,
        });
      }

      const advisors = await pool.query<{
        email: string;
        is_active: boolean;
        is_director: boolean;
      }>(
        `
          SELECT u.email, a.is_active, a.is_director
          FROM advisors a
          JOIN users u ON u.id = a.user_id
          WHERE u.email = 'advisor@example.test'
        `,
      );

      expect(advisors.rows).toEqual([
        {
          email: "advisor@example.test",
          is_active: true,
          is_director: true,
        },
      ]);
    },
  );

  it("refuses development and test seeds in production", async () => {
    await expect(runSeed("development", "production")).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Development and test seeds cannot run in production",
      ),
    });
  });
});
