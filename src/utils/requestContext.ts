import type { Request } from "express";

export type UserRole = "advisor" | "reviewer" | "admin";

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  currentUser: CurrentUser | null;
}

function getForwardedIp(req: Request): string | undefined {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0]?.trim();
  }

  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0]?.split(",")[0]?.trim();
  }

  return undefined;
}

function normalizeRole(role: unknown): UserRole | undefined {
  if (role === "advisor" || role === "reviewer" || role === "admin") {
    return role;
  }

  return undefined;
}

function getCurrentUser(req: Request): CurrentUser | null {
  const user = req.user;
  const role = normalizeRole(user?.role);

  if (!user?.id || !user.email || !role) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role,
  };
}

export function getRequestContext(req: Request): RequestContext {
  return {
    ipAddress: getForwardedIp(req) ?? req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
    currentUser: getCurrentUser(req),
  };
}
