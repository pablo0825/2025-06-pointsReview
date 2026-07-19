import { describe, expect, it } from "vitest";

import {
  ACTIVATION_TOKEN_TTL_MS,
  generateAccountToken,
  getActivationTokenExpiresAt,
  getPasswordResetTokenExpiresAt,
  hashAccountToken,
  isValidAccountToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "../../src/auth/accountToken";
import { assertPasswordPolicy } from "../../src/auth/passwordPolicy";
import { AccountEmailTemplateRenderer } from "../../src/email/accountEmailTemplate.renderer";
import { ApiError } from "../../src/errors/apiError";
import { passwordSchema } from "../../src/schemas/password.schema";

describe("Phase 4.3 account security primitives", () => {
  it("enforces the documented password length", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(128)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });

  it("rejects common passwords and the normalized Email local part", () => {
    expect(() =>
      assertPasswordPolicy("PASSWORD123", "user@example.test"),
    ).toThrow(ApiError);
    expect(() =>
      assertPasswordPolicy("ReviewAccount2026", "reviewaccount2026@example.test"),
    ).toThrow(ApiError);
    expect(() =>
      assertPasswordPolicy("ReviewAccount2026!", "user@example.test"),
    ).not.toThrow();
  });

  it("generates fixed-format random tokens and SHA-256 hashes", () => {
    const first = generateAccountToken();
    const second = generateAccountToken();

    expect(first).not.toBe(second);
    expect(isValidAccountToken(first)).toBe(true);
    expect(hashAccountToken(first)).toHaveLength(32);
    expect(hashAccountToken(first).equals(hashAccountToken(first))).toBe(true);
    expect(isValidAccountToken("invalid token")).toBe(false);
  });

  it("calculates activation and reset expiry from the supplied clock", () => {
    const now = new Date("2026-07-19T00:00:00.000Z");

    expect(getActivationTokenExpiresAt(now).getTime()).toBe(
      now.getTime() + ACTIVATION_TOKEN_TTL_MS,
    );
    expect(getPasswordResetTokenExpiresAt(now).getTime()).toBe(
      now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS,
    );
  });
});

describe("account Email renderer", () => {
  const renderer = new AccountEmailTemplateRenderer();

  it("renders activation and password reset payloads", async () => {
    const activation = await renderer.render("account_activation", {
      displayName: "王小明",
      activationUrl: "https://example.test/auth/activation/raw-token",
      expiresAt: "2026-07-20T00:00:00.000Z",
    });
    const reset = await renderer.render("password_reset", {
      displayName: "王小明",
      resetUrl: "https://example.test/auth/password-reset/raw-token",
      expiresAt: "2026-07-19T00:30:00.000Z",
    });

    expect(activation.subject).toContain("啟用");
    expect(activation.html).toContain("/auth/activation/raw-token");
    expect(reset.subject).toContain("重設");
    expect(reset.html).toContain("/auth/password-reset/raw-token");
  });

  it("rejects malformed payloads and escapes display fields", async () => {
    await expect(
      renderer.render("account_activation", {
        displayName: "<script>alert(1)</script>",
        activationUrl: "https://example.test/auth/activation/raw-token",
        expiresAt: "2026-07-20T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      html: expect.not.stringContaining("<script>"),
    });

    await expect(
      renderer.render("password_reset", {
        displayName: "王小明",
        resetUrl: "not-a-url",
        expiresAt: "2026-07-19T00:30:00.000Z",
      }),
    ).rejects.toBeDefined();
  });
});
