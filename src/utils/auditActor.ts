import type { Request } from "express";

import type { AuditActorContext } from "../services/auditLog.service";
import { getRequestContext } from "./requestContext";

export function getAuditActor(req: Request): AuditActorContext {
  const context = getRequestContext(req);

  if (!context.currentUser) {
    throw new Error("Authenticated route reached without current user");
  }

  return {
    actorUserId: context.currentUser.id,
    ipAddress: context.ipAddress ?? "0.0.0.0",
    userAgent: context.userAgent ?? "unknown",
  };
}
