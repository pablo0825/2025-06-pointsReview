import type { ApplicationInstructionRow } from "../repositories/applicationInstruction.repository";

export function toAdminApplicationInstructionResponse(
  row: ApplicationInstructionRow,
) {
  return {
    id: Number(row.id),
    applicationType: row.application_type,
    sectionKey: row.section_key,
    title: row.title,
    content: row.content,
    displayOrder: row.display_order,
    isVisible: row.is_visible,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toPublicApplicationInstructionResponse(
  row: ApplicationInstructionRow,
) {
  return {
    sectionKey: row.section_key,
    title: row.title,
    content: row.content,
    displayOrder: row.display_order,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}
