import type { RequestHandler } from "express";

import { ApiError } from "../errors/apiError";
import { hasPermission, isRole, type Permission } from "../auth/permissions";

function createForbiddenError(): ApiError {
  return new ApiError(403, "forbidden", "沒有執行此操作的權限。");
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const role = req.user?.role;

    if (!isRole(role) || !hasPermission(role, permission)) {
      next(createForbiddenError());
      return;
    }

    next();
  };
}

export function requireAnyPermission(
  permissions: readonly Permission[],
): RequestHandler {
  return (req, _res, next) => {
    const role = req.user?.role;

    if (
      !isRole(role) ||
      !permissions.some((permission) => hasPermission(role, permission))
    ) {
      next(createForbiddenError());
      return;
    }

    next();
  };
}
