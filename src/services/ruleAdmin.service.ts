import { pool } from "../db/pool";
import { withTransaction } from "../db/transaction";
import type { ApplicationType } from "../domain/applicationTypes";
import { ApiError } from "../errors/apiError";
import { createApiErrorFromPostgresError } from "../errors/postgresError";
import { ParticipantRuleRepository } from "../repositories/participantRule.repository";
import { PointRuleRepository } from "../repositories/pointRule.repository";
import type {
  CreateParticipantRuleBody,
  CreatePointRuleBody,
  DeactivateRuleBody,
  ParticipantRuleListQuery,
  PointRuleListQuery,
} from "../schemas/rule.schema";
import { AuditLogService, type AuditActorContext } from "./auditLog.service";

function ruleNotFound(): ApiError {
  return new ApiError(404, "not_found", "規則不存在。");
}

function invalidEffectiveTo(message: string): ApiError {
  return new ApiError(422, "validation_failed", "規則無法停用。", [
    { path: "effectiveTo", message },
  ]);
}

function mapConstraintError(error: unknown): never {
  throw createApiErrorFromPostgresError(error) ?? error;
}

export async function listPointRules(input: PointRuleListQuery) {
  return PointRuleRepository.list(
    pool,
    input.applicationType,
    input.includeExpired,
  );
}

export async function createPointRule(
  input: CreatePointRuleBody,
  actor: AuditActorContext,
) {
  return withTransaction(async (client) => {
    try {
      await PointRuleRepository.closeOpenEndedVersion(client, input);
      const rule = await PointRuleRepository.create(client, input);
      await AuditLogService.record(client, {
        ...actor,
        action: "point_rule.created",
        resourceType: "point_rule",
        resourceId: rule.id,
        metadata: { application_type: input.applicationType },
      });
      return rule;
    } catch (error) {
      return mapConstraintError(error);
    }
  });
}

export async function deactivatePointRule(
  applicationType: ApplicationType,
  ruleId: string,
  input: DeactivateRuleBody,
  actor: AuditActorContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const rule = await PointRuleRepository.findByIdForUpdate(
      client,
      applicationType,
      ruleId,
    );
    if (!rule) throw ruleNotFound();
    if (rule.effective_to !== null) {
      throw invalidEffectiveTo("這個規則版本已經有結束日期。");
    }
    if (input.effectiveTo <= rule.effective_from) {
      throw invalidEffectiveTo("失效日期必須晚於生效日期。");
    }

    try {
      await PointRuleRepository.setEffectiveTo(
        client,
        applicationType,
        ruleId,
        input.effectiveTo,
      );
      await AuditLogService.record(client, {
        ...actor,
        action: "point_rule.deactivated",
        resourceType: "point_rule",
        resourceId: ruleId,
        metadata: {
          application_type: applicationType,
          effective_to: input.effectiveTo,
          reason: input.reason,
        },
      });
    } catch (error) {
      return mapConstraintError(error);
    }
  });
}

export async function listParticipantRules(input: ParticipantRuleListQuery) {
  return ParticipantRuleRepository.list(
    pool,
    input.applicationType,
    input.includeExpired,
  );
}

export async function createParticipantRule(
  input: CreateParticipantRuleBody,
  actor: AuditActorContext,
) {
  return withTransaction(async (client) => {
    try {
      await ParticipantRuleRepository.closeOpenEndedVersion(client, input);
      const rule = await ParticipantRuleRepository.create(client, input);
      await AuditLogService.record(client, {
        ...actor,
        action: "participant_rule.created",
        resourceType: "participant_rule",
        resourceId: rule.id,
        metadata: { application_type: input.applicationType },
      });
      return rule;
    } catch (error) {
      return mapConstraintError(error);
    }
  });
}

export async function deactivateParticipantRule(
  ruleId: string,
  input: DeactivateRuleBody,
  actor: AuditActorContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const rule = await ParticipantRuleRepository.findByIdForUpdate(
      client,
      ruleId,
    );
    if (!rule) throw ruleNotFound();
    if (rule.effective_to !== null) {
      throw invalidEffectiveTo("這個規則版本已經有結束日期。");
    }
    if (input.effectiveTo <= rule.effective_from) {
      throw invalidEffectiveTo("失效日期必須晚於生效日期。");
    }

    try {
      await ParticipantRuleRepository.setEffectiveTo(
        client,
        ruleId,
        input.effectiveTo,
      );
      await AuditLogService.record(client, {
        ...actor,
        action: "participant_rule.deactivated",
        resourceType: "participant_rule",
        resourceId: ruleId,
        metadata: {
          application_type: rule.application_type,
          effective_to: input.effectiveTo,
          reason: input.reason,
        },
      });
    } catch (error) {
      return mapConstraintError(error);
    }
  });
}

export const RuleAdminService = {
  listPointRules,
  createPointRule,
  deactivatePointRule,
  listParticipantRules,
  createParticipantRule,
  deactivateParticipantRule,
};
