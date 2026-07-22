import type { Request, Response } from "express";

import {
  toAdminApplicationInstructionResponse,
  toPublicApplicationInstructionResponse,
} from "../mappers/applicationInstruction.mapper";
import type {
  AdminApplicationInstructionListQuery,
  CreateApplicationInstructionBody,
  PublicApplicationInstructionQuery,
  UpdateApplicationInstructionBody,
} from "../schemas/applicationInstruction.schema";
import { ApplicationInstructionService } from "../services/applicationInstruction.service";
import { getAuditActor } from "../utils/auditActor";

export async function listAdminInstructions(req: Request, res: Response) {
  const query = req.query as unknown as AdminApplicationInstructionListQuery;
  const result = await ApplicationInstructionService.listAdmin(query);
  res.status(200).json({
    data: result.items.map(toAdminApplicationInstructionResponse),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / query.pageSize),
    },
  });
}

export async function listPublicInstructions(req: Request, res: Response) {
  const query = req.query as unknown as PublicApplicationInstructionQuery;
  const rows = await ApplicationInstructionService.listPublic(query);
  res.status(200).json({
    data: rows.map(toPublicApplicationInstructionResponse),
  });
}

export async function createInstruction(req: Request, res: Response) {
  const row = await ApplicationInstructionService.create(
    req.body as CreateApplicationInstructionBody,
    getAuditActor(req),
  );
  res.status(201).json({ data: toAdminApplicationInstructionResponse(row) });
}

export async function updateInstruction(req: Request, res: Response) {
  const row = await ApplicationInstructionService.update(
    String(req.params.instructionId),
    req.body as UpdateApplicationInstructionBody,
    getAuditActor(req),
  );
  res.status(200).json({ data: toAdminApplicationInstructionResponse(row) });
}

export async function showInstruction(req: Request, res: Response) {
  await ApplicationInstructionService.setVisible(
    String(req.params.instructionId),
    true,
    getAuditActor(req),
  );
  res.status(200).json({ data: { ok: true } });
}

export async function hideInstruction(req: Request, res: Response) {
  await ApplicationInstructionService.setVisible(
    String(req.params.instructionId),
    false,
    getAuditActor(req),
  );
  res.status(200).json({ data: { ok: true } });
}
