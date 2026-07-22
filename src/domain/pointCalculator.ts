import type { SubmissionParticipant } from "../schemas/applicationSubmission.schema";

export interface CompetitionPointRule {
  allocationMethod: "per_person" | "shared_total";
  points: string;
}

export interface ProjectPointRule {
  salaryUnit: number;
  pointsPerUnit: string;
  maximumPoints: string | null;
}

export interface ExhibitionPointRule {
  minimumPointsPerPerson: string;
  maximumPointsPerPerson: string;
}

export class PointCalculationError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "PointCalculationError";
  }
}

export function pointsToUnits(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function unitsToPoints(units: number): string {
  return `${Math.floor(units / 100)}.${String(units % 100).padStart(2, "0")}`;
}

export function calculateCompetitionPoints(
  participants: SubmissionParticipant[],
  rule: CompetitionPointRule,
): string {
  const ruleUnits = pointsToUnits(rule.points);
  const requested = participants.map((participant) =>
    pointsToUnits(participant.requestedPoints),
  );
  if (
    rule.allocationMethod === "per_person" &&
    requested.some((units) => units !== ruleUnits)
  ) {
    throw new PointCalculationError(
      "participants",
      "每位參與者的申請點數必須等於競賽規則點數。",
    );
  }
  const total = requested.reduce((sum, units) => sum + units, 0);
  if (rule.allocationMethod === "shared_total" && total !== ruleUnits) {
    throw new PointCalculationError(
      "participants",
      "參與者申請點數總和必須等於競賽規則總點數。",
    );
  }
  return unitsToPoints(total);
}

export function calculateProjectPoints(
  totalSalary: number,
  rule: ProjectPointRule,
): string {
  let units =
    Math.floor(totalSalary / rule.salaryUnit) *
    pointsToUnits(rule.pointsPerUnit);
  if (rule.maximumPoints !== null) {
    units = Math.min(units, pointsToUnits(rule.maximumPoints));
  }
  if (units <= 0) {
    throw new PointCalculationError(
      "typeDetails.salaryItems",
      "薪資總額未達可申請點數的最低換算單位。",
    );
  }
  return unitsToPoints(units);
}

export function calculateCertificatePoints(pointsPerCertificate: string) {
  return unitsToPoints(pointsToUnits(pointsPerCertificate));
}

export function calculateExhibitionPoints(
  participants: SubmissionParticipant[],
  rule: ExhibitionPointRule,
): string {
  const minimum = pointsToUnits(rule.minimumPointsPerPerson);
  const maximum = pointsToUnits(rule.maximumPointsPerPerson);
  const requested = participants.map((participant) =>
    pointsToUnits(participant.requestedPoints),
  );
  const invalidIndex = requested.findIndex(
    (units) => units < minimum || units > maximum,
  );
  if (invalidIndex >= 0) {
    throw new PointCalculationError(
      `participants.${invalidIndex}.requestedPoints`,
      "申請點數不在展覽規則允許範圍內。",
    );
  }
  return unitsToPoints(requested.reduce((sum, units) => sum + units, 0));
}
