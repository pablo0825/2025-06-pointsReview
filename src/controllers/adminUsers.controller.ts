import type { Request, Response } from "express";

import {
  toAdminUserListItem,
  toAdminUserResponse,
} from "../mappers/adminUser.mapper";
import type {
  AdminUserListQuery,
  CreateAdminUserBody,
  DeactivateAdminUserBody,
  TransferAdminBody,
  UpdateAdminUserBody,
} from "../schemas/adminUser.schema";
import { UserAdminService } from "../services/userAdmin.service";
import type { AuditActorContext } from "../services/auditLog.service";
import { getRequestContext } from "../utils/requestContext";

function getUserId(req: Request): string {
  return String(req.params.userId);
}

function getAuditActor(req: Request): AuditActorContext {
  const context = getRequestContext(req);

  if (!context.currentUser) {
    throw new Error("Authenticated admin route reached without current user");
  }

  return {
    actorUserId: context.currentUser.id,
    ipAddress: context.ipAddress ?? "0.0.0.0",
    userAgent: context.userAgent ?? "unknown",
  };
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as AdminUserListQuery;
  const result = await UserAdminService.listUsers(query);

  res.status(200).json({
    data: result.items.map(toAdminUserListItem),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / query.pageSize),
    },
  });
}

export async function getUserDetail(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await UserAdminService.getUserDetail(getUserId(req));
  res.status(200).json({ data: toAdminUserResponse(user) });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const user = await UserAdminService.createUser(
    req.body as CreateAdminUserBody,
    getAuditActor(req),
  );
  res.status(201).json({ data: toAdminUserResponse(user) });
}

export async function resendActivation(
  req: Request,
  res: Response,
): Promise<void> {
  await UserAdminService.resendActivation(getUserId(req), getAuditActor(req));
  res.status(200).json({ data: { ok: true } });
}

export async function sendPasswordReset(
  req: Request,
  res: Response,
): Promise<void> {
  await UserAdminService.sendPasswordReset(getUserId(req), getAuditActor(req));
  res.status(200).json({ data: { ok: true } });
}

export async function transferAdmin(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as TransferAdminBody;
  await UserAdminService.transferAdmin(
    getUserId(req),
    body.reason,
    getAuditActor(req),
  );
  res.status(200).json({ data: { ok: true } });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const user = await UserAdminService.updateUser(
    getUserId(req),
    req.body as UpdateAdminUserBody,
    getAuditActor(req),
  );

  res.status(200).json({ data: toAdminUserResponse(user) });
}

export async function activateUser(req: Request, res: Response): Promise<void> {
  await UserAdminService.activateUser(getUserId(req), getAuditActor(req));
  res.status(200).json({ data: { ok: true } });
}

export async function deactivateUser(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as DeactivateAdminUserBody;
  await UserAdminService.deactivateUser(
    getUserId(req),
    body.reason,
    getAuditActor(req),
  );
  res.status(200).json({ data: { ok: true } });
}
