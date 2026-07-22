import { pool } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ApiError } from "../errors/apiError";
import { createApiErrorFromPostgresError } from "../errors/postgresError";
import { ApplicationInstructionRepository } from "../repositories/applicationInstruction.repository";
import type {
  AdminApplicationInstructionListQuery,
  CreateApplicationInstructionBody,
  PublicApplicationInstructionQuery,
  UpdateApplicationInstructionBody,
} from "../schemas/applicationInstruction.schema";
import { AuditLogService, type AuditActorContext } from "./auditLog.service";

function instructionNotFound(): ApiError {
  return new ApiError(404, "not_found", "申請說明不存在。");
}

function mapConstraintError(error: unknown): never {
  throw createApiErrorFromPostgresError(error) ?? error;
}

export async function listAdmin(input: AdminApplicationInstructionListQuery) {
  return ApplicationInstructionRepository.listAdmin(pool, input);
}

export async function listPublic(input: PublicApplicationInstructionQuery) {
  return ApplicationInstructionRepository.listPublic(
    pool,
    input.applicationType,
    input.includeHistorical,
  );
}

export async function create(
  input: CreateApplicationInstructionBody,
  actor: AuditActorContext,
) {
  return withTransaction(async (client) => {
    try {
      await ApplicationInstructionRepository.closeOpenEndedVersion(
        client,
        input,
      );
      const instruction = await ApplicationInstructionRepository.create(
        client,
        input,
      );
      await AuditLogService.record(client, {
        ...actor,
        action: "application_instruction.created",
        resourceType: "application_instruction",
        resourceId: instruction.id,
        metadata: {
          application_type: input.applicationType,
          section_key: input.sectionKey,
        },
      });
      return instruction;
    } catch (error) {
      return mapConstraintError(error);
    }
  });
}

function getChangedFields(
  current: NonNullable<
    Awaited<
      ReturnType<typeof ApplicationInstructionRepository.findByIdForUpdate>
    >
  >,
  input: UpdateApplicationInstructionBody,
): string[] {
  const comparisons: Array<[string, unknown, unknown]> = [
    ["application_type", input.applicationType, current.application_type],
    ["section_key", input.sectionKey, current.section_key],
    ["title", input.title, current.title],
    ["content", input.content, current.content],
    ["display_order", input.displayOrder, current.display_order],
    ["effective_from", input.effectiveFrom, current.effective_from],
    ["effective_to", input.effectiveTo, current.effective_to],
  ];
  return comparisons
    .filter(([, next, previous]) => next !== undefined && next !== previous)
    .map(([field]) => field);
}

export async function update(
  instructionId: string,
  input: UpdateApplicationInstructionBody,
  actor: AuditActorContext,
) {
  return withTransaction(async (client) => {
    const current = await ApplicationInstructionRepository.findByIdForUpdate(
      client,
      instructionId,
    );
    if (!current) throw instructionNotFound();

    const fields = getChangedFields(current, input);
    if (fields.length === 0) return current;
    if (
      current.has_started &&
      fields.some((field) => field !== "display_order")
    ) {
      throw new ApiError(
        409,
        "application_instruction_already_effective",
        "已生效的申請說明只能調整顯示順序；內容請建立接續版本。",
      );
    }

    const effectiveFrom = input.effectiveFrom ?? current.effective_from;
    const effectiveTo =
      input.effectiveTo === undefined
        ? current.effective_to
        : input.effectiveTo;
    if (effectiveTo !== null && effectiveTo <= effectiveFrom) {
      throw new ApiError(422, "validation_failed", "有效期間不正確。", [
        { path: "effectiveTo", message: "失效日期必須晚於生效日期。" },
      ]);
    }

    try {
      const updated = await ApplicationInstructionRepository.update(
        client,
        instructionId,
        input,
      );
      await AuditLogService.record(client, {
        ...actor,
        action: "application_instruction.updated",
        resourceType: "application_instruction",
        resourceId: instructionId,
        metadata: { changed_fields: fields },
      });
      return updated;
    } catch (error) {
      return mapConstraintError(error);
    }
  });
}

export async function setVisible(
  instructionId: string,
  isVisible: boolean,
  actor: AuditActorContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const current = await ApplicationInstructionRepository.findByIdForUpdate(
      client,
      instructionId,
    );
    if (!current) throw instructionNotFound();
    if (current.is_visible === isVisible) return;

    await ApplicationInstructionRepository.setVisible(
      client,
      instructionId,
      isVisible,
    );
    await AuditLogService.record(client, {
      ...actor,
      action: "application_instruction.visibility_changed",
      resourceType: "application_instruction",
      resourceId: instructionId,
      metadata: {
        previous_is_visible: current.is_visible,
        new_is_visible: isVisible,
      },
    });
  });
}

export const ApplicationInstructionService = {
  listAdmin,
  listPublic,
  create,
  update,
  setVisible,
};
