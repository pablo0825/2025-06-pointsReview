import type { ApplicationType } from "../domain/applicationTypes";
import type { ParticipantRuleRow } from "../repositories/participantRule.repository";
import type { PointRuleRow } from "../repositories/pointRule.repository";

function toIso(value: Date): string {
  return value.toISOString();
}

export function toPointRuleResponse(
  applicationType: ApplicationType,
  row: PointRuleRow,
): Record<string, unknown> {
  const common = {
    id: Number(row.id),
    applicationType,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };

  switch (applicationType) {
    case "competition":
      return {
        ...common,
        competitionLevel: row.competition_level,
        award: row.award,
        allocationMethod: row.allocation_method,
        points: row.points,
      };
    case "project_participation":
      return {
        ...common,
        salaryUnit: Number(row.salary_unit),
        pointsPerUnit: row.points_per_unit,
        roundingMethod: row.rounding_method,
        maximumPoints: row.maximum_points,
      };
    case "certificate":
      return {
        ...common,
        pointsPerCertificate: row.points_per_certificate,
        maximumPointsPerStudent: row.maximum_points_per_student,
      };
    case "external_exhibition":
      return {
        ...common,
        exhibitionType: row.exhibition_type,
        minimumPointsPerPerson: row.minimum_points_per_person,
        maximumPointsPerPerson: row.maximum_points_per_person,
      };
  }
}

export function toParticipantRuleResponse(row: ParticipantRuleRow) {
  return {
    id: Number(row.id),
    applicationType: row.application_type,
    minimumParticipants: row.minimum_participants,
    maximumParticipants: row.maximum_participants,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}
