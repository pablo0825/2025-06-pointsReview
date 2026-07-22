import type { Request, Response } from "express";

import type { ApplicationType } from "../domain/applicationTypes";
import {
  toParticipantRuleResponse,
  toPointRuleResponse,
} from "../mappers/rule.mapper";
import type {
  CreateParticipantRuleBody,
  CreatePointRuleBody,
  DeactivateRuleBody,
  ParticipantRuleListQuery,
  PointRuleListQuery,
} from "../schemas/rule.schema";
import { RuleAdminService } from "../services/ruleAdmin.service";
import { getAuditActor } from "../utils/auditActor";

export async function listPointRules(req: Request, res: Response) {
  const query = req.query as unknown as PointRuleListQuery;
  const rows = await RuleAdminService.listPointRules(query);
  res.status(200).json({
    data: rows.map((row) => toPointRuleResponse(query.applicationType, row)),
  });
}

export async function createPointRule(req: Request, res: Response) {
  const body = req.body as CreatePointRuleBody;
  const row = await RuleAdminService.createPointRule(body, getAuditActor(req));
  res.status(201).json({
    data: toPointRuleResponse(body.applicationType, row),
  });
}

export async function deactivatePointRule(req: Request, res: Response) {
  await RuleAdminService.deactivatePointRule(
    String(req.params.applicationType) as ApplicationType,
    String(req.params.ruleId),
    req.body as DeactivateRuleBody,
    getAuditActor(req),
  );
  res.status(200).json({ data: { ok: true } });
}

export async function listParticipantRules(req: Request, res: Response) {
  const query = req.query as unknown as ParticipantRuleListQuery;
  const rows = await RuleAdminService.listParticipantRules(query);
  res.status(200).json({ data: rows.map(toParticipantRuleResponse) });
}

export async function createParticipantRule(req: Request, res: Response) {
  const body = req.body as CreateParticipantRuleBody;
  const row = await RuleAdminService.createParticipantRule(
    body,
    getAuditActor(req),
  );
  res.status(201).json({ data: toParticipantRuleResponse(row) });
}

export async function deactivateParticipantRule(req: Request, res: Response) {
  await RuleAdminService.deactivateParticipantRule(
    String(req.params.ruleId),
    req.body as DeactivateRuleBody,
    getAuditActor(req),
  );
  res.status(200).json({ data: { ok: true } });
}
