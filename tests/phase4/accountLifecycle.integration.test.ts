import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashAccountToken } from "../../src/auth/accountToken";
import { hashPassword, verifyPassword } from "../../src/auth/password";
import { createApp } from "../../src/app";
import { closePool, pool } from "../../src/db/pool";
import { createAuthTestUser, resetAuthTestData } from "../helpers/auth";

const OLD_PASSWORD = "old-password-2026";
const NEW_PASSWORD = "new-password-2026";
let oldPasswordHash: string;

async function createPendingAccount(input: {
  email: string;
  role?: "advisor" | "reviewer" | "admin";
  token: string;
  expiresAt?: Date;
}) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (
       display_name, email, role, activation_token_hash,
       activation_token_expires_at
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING id::text`,
    [
      "待啟用帳號",
      input.email,
      input.role ?? "reviewer",
      hashAccountToken(input.token),
      input.expiresAt ?? new Date(Date.now() + 60_000),
    ],
  );
  return result.rows[0].id;
}

async function getLatestResetToken(): Promise<string> {
  const result = await pool.query<{ payload: { resetUrl: string } }>(
    `SELECT payload
     FROM email_tasks
     WHERE template_name = 'password_reset'
     ORDER BY id DESC
     LIMIT 1`,
  );
  const url = new URL(result.rows[0].payload.resetUrl);
  return url.pathname.split("/").at(-1) as string;
}

describe.sequential("Phase 4.3 public account lifecycle API", () => {
  beforeAll(async () => {
    oldPasswordHash = await hashPassword(OLD_PASSWORD);
  });

  beforeEach(resetAuthTestData);

  afterAll(async () => {
    await resetAuthTestData();
    await closePool();
  });

  it("activates an account once and applies the password policy", async () => {
    const token = "A".repeat(43);
    const userId = await createPendingAccount({
      email: "pending@phase43.test",
      token,
    });
    const app = createApp();

    const weakPassword = await request(app)
      .post(`/auth/activation/${token}`)
      .send({ password: "PASSWORD123" });
    expect(weakPassword.status).toBe(422);
    expect(weakPassword.body.code).toBe("validation_failed");

    const activated = await request(app)
      .post(`/auth/activation/${token}`)
      .send({ password: NEW_PASSWORD });
    expect(activated.status).toBe(200);

    const user = await pool.query<{
      password_hash: string;
      activated_at: Date;
      is_active: boolean;
      activation_token_hash: Buffer | null;
    }>(
      `SELECT password_hash, activated_at, is_active, activation_token_hash
       FROM users WHERE id = $1`,
      [userId],
    );
    expect(await verifyPassword(NEW_PASSWORD, user.rows[0].password_hash)).toBe(
      true,
    );
    expect(user.rows[0].activated_at).toBeInstanceOf(Date);
    expect(user.rows[0].is_active).toBe(true);
    expect(user.rows[0].activation_token_hash).toBeNull();

    const reused = await request(app)
      .post(`/auth/activation/${token}`)
      .send({ password: NEW_PASSWORD });
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe("account_token_invalid");
  });

  it("returns one account token error for malformed and expired tokens", async () => {
    const expiredToken = "B".repeat(43);
    await createPendingAccount({
      email: "expired@phase43.test",
      token: expiredToken,
      expiresAt: new Date(Date.now() - 1_000),
    });

    for (const token of ["malformed", expiredToken]) {
      const response = await request(createApp())
        .post(`/auth/activation/${token}`)
        .send({ password: NEW_PASSWORD });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("account_token_invalid");
    }
  });

  it("keeps a second activated admin inactive until transfer", async () => {
    await createAuthTestUser({
      email: "active-admin@phase43.test",
      passwordHash: oldPasswordHash,
      role: "admin",
    });
    const token = "C".repeat(43);
    const candidateId = await createPendingAccount({
      email: "candidate-admin@phase43.test",
      role: "admin",
      token,
    });

    const response = await request(createApp())
      .post(`/auth/activation/${token}`)
      .send({ password: NEW_PASSWORD });
    expect(response.status).toBe(200);

    const candidate = await pool.query<{
      activated_at: Date;
      is_active: boolean;
    }>("SELECT activated_at, is_active FROM users WHERE id = $1", [candidateId]);
    expect(candidate.rows[0].activated_at).toBeInstanceOf(Date);
    expect(candidate.rows[0].is_active).toBe(false);
  });

  it("does not disclose account existence or create tasks for unactivated users", async () => {
    await createAuthTestUser({
      email: "existing@phase43.test",
      passwordHash: oldPasswordHash,
    });
    await createAuthTestUser({
      email: "unactivated@phase43.test",
      passwordHash: null,
      isActive: false,
      isActivated: false,
    });

    const app = createApp();
    for (const email of [
      "existing@phase43.test",
      "missing@phase43.test",
      "unactivated@phase43.test",
    ]) {
      const response = await request(app)
        .post("/auth/password-reset/request")
        .send({ email });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { ok: true } });
    }

    const tasks = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM email_tasks",
    );
    expect(Number(tasks.rows[0].count)).toBe(1);
  });

  it("resets the password, revokes sessions, audits, and consumes the token", async () => {
    const user = await createAuthTestUser({
      email: "reset@phase43.test",
      passwordHash: oldPasswordHash,
    });
    const app = createApp();
    const agent = request.agent(app);
    expect(
      (
        await agent.post("/auth/login").send({
          email: user.email,
          password: OLD_PASSWORD,
        })
      ).status,
    ).toBe(200);

    await request(app)
      .post("/auth/password-reset/request")
      .send({ email: user.email });
    const token = await getLatestResetToken();
    const reset = await request(app)
      .post(`/auth/password-reset/${token}`)
      .send({ password: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    expect((await agent.get("/auth/me")).status).toBe(401);

    const session = await pool.query<{ revoked_reason: string }>(
      "SELECT revoked_reason FROM user_sessions WHERE user_id = $1",
      [user.id],
    );
    expect(session.rows[0].revoked_reason).toBe("password_reset");
    const audit = await pool.query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE resource_id = $1 ORDER BY id",
      [user.id],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      "user.sessions_revoked",
      "user.password_reset_completed",
    ]);

    const reused = await request(app)
      .post(`/auth/password-reset/${token}`)
      .send({ password: "another-new-password" });
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe("account_token_invalid");
  });
});
