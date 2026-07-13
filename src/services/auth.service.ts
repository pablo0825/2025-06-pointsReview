import type { Response } from "express";

import {
  getSessionExpiresAt,
  setSessionCookie,
  clearSessionCookie,
} from "../auth/sessionConfig";
import {
  generateCsrfToken,
  generateSessionToken,
  hashToken,
} from "../auth/sessionToken";
import { verifyPassword } from "../auth/password";
import {
  rolePermissions,
  type Permission,
  type Role,
} from "../auth/permissions";
import type { DatabaseClient } from "../db/types";
import { pool } from "../db/pool";
import { ApiError } from "../errors/apiError";
import { SessionRepository } from "../repositories/session.repository";
import { UserRepository, type UserRow } from "../repositories/user.repository";

interface LoginInput {
  email: string;
  password: string;
  ipAddress: string;
  userAgent: string;
}

export interface AuthUserResponse {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}

export interface AuthUserWithPermissionsResponse extends AuthUserResponse {
  permissions: Permission[];
}

function toAuthUser(user: UserRow): AuthUserResponse {
  return {
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
  };
}

function getPermissions(role: Role): Permission[] {
  return Array.from(rolePermissions[role]);
}

function createLoginFailedError(): ApiError {
  return new ApiError(401, "unauthenticated", "帳號或密碼錯誤。");
}

async function assertLoginAllowed(
  user: UserRow | null,
  password: string,
): Promise<UserRow> {
  if (!user || !user.password_hash || !user.is_active || !user.activated_at) {
    throw createLoginFailedError();
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);

  if (!passwordMatches) {
    throw createLoginFailedError();
  }

  return user;
}

export async function login(
  input: LoginInput,
  res: Response,
  client: DatabaseClient = pool,
): Promise<AuthUserResponse> {
  const user = await assertLoginAllowed(
    await UserRepository.findByEmail(client, input.email),
    input.password,
  );

  const sessionToken = generateSessionToken();
  const csrfToken = generateCsrfToken();

  await SessionRepository.createSession(client, {
    sessionTokenHash: hashToken(sessionToken),
    csrfTokenHash: hashToken(csrfToken),
    userId: user.id,
    expiresAt: getSessionExpiresAt(),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  await UserRepository.updateLastLoginAt(client, user.id);
  setSessionCookie(res, sessionToken);

  return toAuthUser(user);
}

export async function logout(
  sessionId: string,
  res: Response,
  client: DatabaseClient = pool,
): Promise<void> {
  await SessionRepository.revokeSession(client, sessionId, "logout");
  clearSessionCookie(res);
}

export function getCurrentUser(user: {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}): AuthUserWithPermissionsResponse {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    permissions: getPermissions(user.role),
  };
}

export async function rotateCsrfToken(
  sessionId: string,
  client: DatabaseClient = pool,
): Promise<string> {
  const csrfToken = generateCsrfToken();
  const session = await SessionRepository.updateCsrfTokenHash(
    client,
    sessionId,
    hashToken(csrfToken),
  );

  if (!session) {
    throw new ApiError(401, "unauthenticated", "尚未登入或 session 無效。");
  }

  return csrfToken;
}

export const AuthService = {
  login,
  logout,
  getCurrentUser,
  rotateCsrfToken,
};
