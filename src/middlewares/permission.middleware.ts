import type { RequestHandler } from "express";

import { ApiError } from "../errors/apiError";
import { hasPermission, isRole, type Permission } from "../auth/permissions";

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const role = req.user?.role;

    if (!isRole(role) || !hasPermission(role, permission)) {
      next(new ApiError(403, "forbidden", "沒有執行此操作的權限。"));
      return;
    }

    next();
  };
}
