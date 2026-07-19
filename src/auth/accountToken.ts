import crypto from "node:crypto";

import { hashToken } from "./sessionToken";

const ACCOUNT_TOKEN_BYTE_LENGTH = 32;
const ACCOUNT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const ACTIVATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export function generateAccountToken(): string {
  return crypto.randomBytes(ACCOUNT_TOKEN_BYTE_LENGTH).toString("base64url");
}

export function isValidAccountToken(token: string): boolean {
  return ACCOUNT_TOKEN_PATTERN.test(token);
}

export function hashAccountToken(token: string): Buffer {
  return hashToken(token);
}

export function getActivationTokenExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + ACTIVATION_TOKEN_TTL_MS);
}

export function getPasswordResetTokenExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);
}

