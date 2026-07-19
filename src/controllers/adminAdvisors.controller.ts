import type { Request, Response } from "express";

import { toAdminAdvisorResponse } from "../mappers/adminAdvisor.mapper";
import type {
  AdminAdvisorListQuery,
  AdvisorActionBody,
  CreateAdminAdvisorBody,
  UpdateAdminAdvisorBody,
} from "../schemas/adminAdvisor.schema";
import { AdvisorAdminService } from "../services/advisorAdmin.service";
import type { AuditActorContext } from "../services/auditLog.service";
import { getRequestContext } from "../utils/requestContext";

function getAdvisorId(req: Request): string {
  return String(req.params.advisorId);
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

export async function listAdvisors(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as AdminAdvisorListQuery;
  const result = await AdvisorAdminService.listAdvisors(query);

  res.status(200).json({
    data: result.items.map(toAdminAdvisorResponse),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / query.pageSize),
    },
  });
}

export async function createAdvisor(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as CreateAdminAdvisorBody;
  const advisor = await AdvisorAdminService.createAdvisor(
    {
      displayName: body.user.displayName,
      email: body.user.email,
      employeeNumber: body.advisor.employeeNumber,
      name: body.advisor.name,
      titleCode: body.advisor.titleCode,
      department: body.advisor.department,
      isDirector: body.advisor.isDirector,
    },
    getAuditActor(req),
  );
  res.status(201).json({ data: toAdminAdvisorResponse(advisor) });
}

export async function updateAdvisor(
  req: Request,
  res: Response,
): Promise<void> {
  const advisor = await AdvisorAdminService.updateAdvisor(
    getAdvisorId(req),
    req.body as UpdateAdminAdvisorBody,
    getAuditActor(req),
  );

  res.status(200).json({ data: toAdminAdvisorResponse(advisor) });
}

export async function activateAdvisor(
  req: Request,
  res: Response,
): Promise<void> {
  await AdvisorAdminService.activateAdvisor(
    getAdvisorId(req),
    getAuditActor(req),
  );
  res.status(200).json({ data: { ok: true } });
}

export async function deactivateAdvisor(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as AdvisorActionBody;
  await AdvisorAdminService.deactivateAdvisor(
    getAdvisorId(req),
    body.reason,
    getAuditActor(req),
  );
  res.status(200).json({ data: { ok: true } });
}

export async function assignDirector(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as AdvisorActionBody;
  await AdvisorAdminService.assignDirector(
    getAdvisorId(req),
    body.reason,
    getAuditActor(req),
  );
  res.status(200).json({ data: { ok: true } });
}
