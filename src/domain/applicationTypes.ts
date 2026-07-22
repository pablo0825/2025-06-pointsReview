export const applicationTypes = [
  "competition",
  "project_participation",
  "certificate",
  "external_exhibition",
] as const;

export type ApplicationType = (typeof applicationTypes)[number];
