import { afterEach, describe, expect, it } from "vitest";

import {
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  getSessionCookieOptions,
  getSessionExpiresAt,
  isSessionIdleExpired,
} from "../../src/auth/sessionConfig";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("session configuration", () => {
  it("uses the documented cookie settings outside production", () => {
    process.env.NODE_ENV = "test";

    expect(getSessionCookieOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_ABSOLUTE_TIMEOUT_MS,
    });
  });

  it("requires Secure cookies in production", () => {
    process.env.NODE_ENV = "production";

    expect(getSessionCookieOptions().secure).toBe(true);
  });

  it("calculates the seven-day absolute expiry", () => {
    const now = new Date("2026-07-17T00:00:00.000Z");

    expect(getSessionExpiresAt(now).getTime()).toBe(
      now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS,
    );
  });

  it("expires a session only after eight idle hours", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");

    expect(
      isSessionIdleExpired(
        new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS),
        now,
      ),
    ).toBe(false);
    expect(
      isSessionIdleExpired(
        new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS - 1),
        now,
      ),
    ).toBe(true);
  });
});
