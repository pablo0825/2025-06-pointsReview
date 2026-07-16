import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { hashPassword } from "../../src/auth/password";
import { rolePermissions } from "../../src/auth/permissions";
import {
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_TIMEOUT_MS,
} from "../../src/auth/sessionConfig";
import { hashToken } from "../../src/auth/sessionToken";
import { createApp } from "../../src/app";
import { closePool, pool } from "../../src/db/pool";
import {
  createAuthTestUser,
  findAuthTestSession,
  getCookieValue,
  getResponseCookie,
  resetAuthTestData,
  updateAuthTestSession,
} from "../helpers/auth";

const TEST_PASSWORD = "phase-3-test-password";
let passwordHash: string;

async function loginUser(options: {
  email?: string;
  role?: "advisor" | "reviewer" | "admin";
} = {}) {
  const email = options.email ?? "active@example.com";
  const user = await createAuthTestUser({
    displayName: "已啟用使用者",
    email,
    passwordHash,
    role: options.role,
  });
  const agent = request.agent(createApp());
  const response = await agent.post("/auth/login").send({
    email,
    password: TEST_PASSWORD,
  });

  expect(response.status).toBe(200);

  return { agent, response, user };
}

async function expectSessionRejected(
  agent: ReturnType<typeof request.agent>,
): Promise<void> {
  const response = await agent.get("/auth/me");

  expect(response.status).toBe(401);
  expect(response.body).toEqual({
    code: "unauthenticated",
    message: "尚未登入或 session 無效。",
  });
}

describe.sequential("Phase 3 Auth API", () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(TEST_PASSWORD);
  });

  beforeEach(async () => {
    await resetAuthTestData();
  });

  afterAll(async () => {
    await resetAuthTestData();
    await closePool();
  });

  it("logs in an activated user and stores only the session token hash", async () => {
    const startedAt = Date.now();
    const { response, user } = await loginUser();
    const finishedAt = Date.now();
    const cookie = getResponseCookie(response, SESSION_COOKIE_NAME);
    const sessionToken = getCookieValue(cookie);
    const session = await findAuthTestSession(user.id);

    expect(response.body).toEqual({
      data: {
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          role: user.role,
        },
      },
    });
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).not.toContain("Domain=");
    expect(cookie).not.toContain("Secure");
    expect(session.sessionTokenHash.equals(hashToken(sessionToken))).toBe(true);
    expect(sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(
      startedAt + SESSION_ABSOLUTE_TIMEOUT_MS,
    );
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
      finishedAt + SESSION_ABSOLUTE_TIMEOUT_MS,
    );
  });

  it("uses the same response for all login credential and account-state failures", async () => {
    await createAuthTestUser({
      email: "active@example.com",
      passwordHash,
    });
    await createAuthTestUser({
      email: "inactive@example.com",
      passwordHash,
      isActive: false,
    });
    await createAuthTestUser({
      email: "unactivated@example.com",
      passwordHash,
      isActivated: false,
    });
    await createAuthTestUser({
      email: "no-password@example.com",
      passwordHash: null,
    });

    const attempts = [
      { email: "missing@example.com", password: TEST_PASSWORD },
      { email: "active@example.com", password: "wrong-password" },
      { email: "inactive@example.com", password: TEST_PASSWORD },
      { email: "unactivated@example.com", password: TEST_PASSWORD },
      { email: "no-password@example.com", password: TEST_PASSWORD },
    ];

    for (const attempt of attempts) {
      const response = await request(createApp()).post("/auth/login").send(attempt);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        code: "unauthenticated",
        message: "帳號或密碼錯誤。",
      });
      expect(response.headers["set-cookie"]).toBeUndefined();
    }

    const sessionCount = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM user_sessions",
    );
    expect(sessionCount.rows[0].count).toBe("0");
  });

  it("returns the current user permissions and refreshes last_seen_at", async () => {
    const { agent, user } = await loginUser({ role: "reviewer" });
    const session = await findAuthTestSession(user.id);
    const previousLastSeenAt = new Date(Date.now() - 60 * 60 * 1000);

    await updateAuthTestSession(session.id, {
      lastSeenAt: previousLastSeenAt,
    });

    const response = await agent.get("/auth/me");
    const refreshedSession = await findAuthTestSession(user.id);

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      permissions: [...rolePermissions.reviewer],
    });
    expect(refreshedSession.lastSeenAt.getTime()).toBeGreaterThan(
      previousLastSeenAt.getTime(),
    );
  });

  it("rejects a session after the idle timeout", async () => {
    const { agent, user } = await loginUser();
    const session = await findAuthTestSession(user.id);

    await updateAuthTestSession(session.id, {
      lastSeenAt: new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS - 1000),
    });

    await expectSessionRejected(agent);
  });

  it("rejects a session after the absolute timeout", async () => {
    const { agent, user } = await loginUser();
    const session = await findAuthTestSession(user.id);

    await updateAuthTestSession(session.id, {
      createdAt: new Date(Date.now() - SESSION_ABSOLUTE_TIMEOUT_MS - 2000),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expectSessionRejected(agent);
  });

  it("rejects a revoked session", async () => {
    const { agent, user } = await loginUser();
    const session = await findAuthTestSession(user.id);

    await updateAuthTestSession(session.id, {
      revokedAt: new Date(),
      revokedReason: "logout",
    });

    await expectSessionRejected(agent);
  });

  it("rejects a session when the account is deactivated", async () => {
    const { agent, user } = await loginUser();

    await pool.query("UPDATE users SET is_active = FALSE WHERE id = $1", [
      user.id,
    ]);

    await expectSessionRejected(agent);
  });

  it("rotates CSRF tokens and requires the current token for logout", async () => {
    const { agent, user } = await loginUser();

    const firstTokenResponse = await agent.get("/auth/csrf-token");
    const firstToken = firstTokenResponse.body.data.csrfToken as string;
    const secondTokenResponse = await agent.get("/auth/csrf-token");
    const secondToken = secondTokenResponse.body.data.csrfToken as string;

    expect(firstTokenResponse.status).toBe(200);
    expect(secondTokenResponse.status).toBe(200);
    expect(firstToken).not.toBe(secondToken);
    expect(firstToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secondToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const rotatedSession = await findAuthTestSession(user.id);
    expect(rotatedSession.csrfTokenHash.equals(hashToken(secondToken))).toBe(true);
    expect(rotatedSession.csrfTokenHash.equals(hashToken(firstToken))).toBe(false);

    for (const token of [undefined, firstToken, "invalid-token"]) {
      const requestBuilder = agent.post("/auth/logout");
      const response = token
        ? await requestBuilder.set("X-CSRF-Token", token)
        : await requestBuilder;

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        code: "csrf_token_invalid",
        message: "CSRF token 無效。",
      });
    }

    expect((await findAuthTestSession(user.id)).revokedAt).toBeNull();

    const logoutResponse = await agent
      .post("/auth/logout")
      .set("X-CSRF-Token", secondToken);
    const revokedSession = await findAuthTestSession(user.id);
    const clearedCookie = getResponseCookie(
      logoutResponse,
      SESSION_COOKIE_NAME,
    );

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({ data: { ok: true } });
    expect(revokedSession.revokedAt).toBeInstanceOf(Date);
    expect(revokedSession.revokedReason).toBe("logout");
    expect(clearedCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(clearedCookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    await expectSessionRejected(agent);
  });

  it("requires a valid session for current-user and CSRF endpoints", async () => {
    for (const path of ["/auth/me", "/auth/csrf-token"]) {
      const response = await request(createApp()).get(path);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("unauthenticated");
    }
  });
});
