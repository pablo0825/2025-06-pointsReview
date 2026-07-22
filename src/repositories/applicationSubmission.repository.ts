import type { DatabaseClient } from "../db/types";
import type { CreateApplicationSubmission } from "../schemas/applicationSubmission.schema";
import type { ValidatedUpload } from "../files/fileValidator";

export interface AvailableAdvisorRow {
  id: string;
  name: string;
  email: string;
}

export interface CreatedApplicationRow {
  id: string;
  public_id: string;
  submitted_at: Date;
}

export async function findAvailableAdvisor(
  client: DatabaseClient,
  advisorId: number,
): Promise<AvailableAdvisorRow | null> {
  const result = await client.query<AvailableAdvisorRow>(
    `SELECT a.id::text, a.name, u.email
     FROM advisors a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = $1 AND a.is_active = TRUE
       AND u.is_active = TRUE AND u.activated_at IS NOT NULL
     FOR SHARE OF a, u`,
    [advisorId],
  );
  return result.rows[0] ?? null;
}

export async function createApplication(
  client: DatabaseClient,
  input: CreateApplicationSubmission,
  participantRuleId: string,
  requestedTotalPoints: string,
  submittedAt: Date,
  confirmationExpiresAt: Date,
): Promise<CreatedApplicationRow> {
  const result = await client.query<CreatedApplicationRow>(
    `INSERT INTO point_applications
       (application_type, status, advisor_id, application_participant_rule_id,
        applicant_name, applicant_email, applicant_phone,
        requested_total_points, advisor_confirmation_expires_at, submitted_at)
     VALUES ($1, 'pending_advisor', $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id::text, public_id::text, submitted_at`,
    [
      input.applicationType,
      input.advisorId,
      participantRuleId,
      input.applicant.name,
      input.applicant.email,
      input.applicant.phone,
      requestedTotalPoints,
      confirmationExpiresAt,
      submittedAt,
    ],
  );
  return result.rows[0];
}

export async function createParticipants(
  client: DatabaseClient,
  applicationId: string,
  participants: CreateApplicationSubmission["participants"],
): Promise<void> {
  for (const participant of participants) {
    await client.query(
      `INSERT INTO application_participants
        (application_id, academic_year, grade, class_number, student_number,
         student_name, requested_points, is_applicant)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        applicationId,
        participant.academicYear,
        participant.grade,
        participant.classNumber,
        participant.studentNumber,
        participant.studentName,
        participant.requestedPoints,
        participant.isApplicant,
      ],
    );
  }
}

export async function createCompetitionDetail(
  client: DatabaseClient,
  applicationId: string,
  input: Extract<
    CreateApplicationSubmission,
    { applicationType: "competition" }
  >,
  ruleId: string,
) {
  const details = input.typeDetails;
  await client.query(
    `INSERT INTO competition_application_details
      (application_id, competition_level_requested, competition_level_other,
       competition_point_rule_id, competition_name, competition_category,
       award, award_other, competition_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      applicationId,
      details.competitionLevel,
      details.competitionLevelOther,
      ruleId,
      details.competitionName,
      details.competitionCategory,
      details.award,
      details.awardOther,
      details.competitionDate,
    ],
  );
}

export async function createProjectDetail(
  client: DatabaseClient,
  applicationId: string,
  input: Extract<
    CreateApplicationSubmission,
    { applicationType: "project_participation" }
  >,
  ruleId: string,
  totalSalary: number,
  calculatedPoints: string,
) {
  const details = input.typeDetails;
  const result = await client.query<{ id: string }>(
    `INSERT INTO project_participation_details
      (application_id, project_point_rule_id, project_name,
       principal_investigator, work_description, total_salary, calculated_points)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id::text`,
    [
      applicationId,
      ruleId,
      details.projectName,
      details.principalInvestigator,
      details.workDescription,
      totalSalary,
      calculatedPoints,
    ],
  );
  for (const item of details.salaryItems) {
    await client.query(
      `INSERT INTO project_participation_salary_items
        (project_participation_detail_id, salary_month, salary_amount)
       VALUES ($1, $2, $3)`,
      [result.rows[0].id, item.salaryMonth, item.salaryAmount],
    );
  }
}

export async function createCertificateDetail(
  client: DatabaseClient,
  applicationId: string,
  input: Extract<
    CreateApplicationSubmission,
    { applicationType: "certificate" }
  >,
  ruleId: string,
) {
  const details = input.typeDetails;
  await client.query(
    `INSERT INTO certificate_application_details
      (application_id, certificate_point_rule_id, certificate_name,
       issuing_organization, certificate_number, issued_date)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      applicationId,
      ruleId,
      details.certificateName,
      details.certificateIssuer,
      details.certificateNumber,
      details.certificateDate,
    ],
  );
}

export async function createExhibitionDetail(
  client: DatabaseClient,
  applicationId: string,
  input: Extract<
    CreateApplicationSubmission,
    { applicationType: "external_exhibition" }
  >,
  ruleId: string,
) {
  const details = input.typeDetails;
  await client.query(
    `INSERT INTO external_exhibition_details
      (application_id, exhibition_point_rule_id, exhibition_type, work_name,
       exhibition_name, exhibition_name_other, organizer, venue, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      applicationId,
      ruleId,
      details.exhibitionType,
      details.workName,
      details.exhibitionName,
      details.exhibitionNameOther,
      details.organizer,
      details.venue,
      details.startDate,
      details.endDate,
    ],
  );
}

export async function createVersion(
  client: DatabaseClient,
  applicationId: string,
  snapshot: Record<string, unknown>,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO application_versions
      (application_id, version_number, application_snapshot)
     VALUES ($1, 1, $2::jsonb)
     RETURNING id::text`,
    [applicationId, JSON.stringify(snapshot)],
  );
  await client.query(
    "UPDATE point_applications SET current_version_id = $2 WHERE id = $1",
    [applicationId, result.rows[0].id],
  );
  return result.rows[0].id;
}

export async function createAttachment(
  client: DatabaseClient,
  input: {
    publicId: string;
    applicationId: string;
    versionId: string;
    metadata: CreateApplicationSubmission["attachments"][number];
    upload: ValidatedUpload;
    storageKey: string;
  },
) {
  await client.query(
    `INSERT INTO application_attachments
      (public_id, application_id, application_version_id, attachment_type,
       attachment_type_other, description, original_filename, storage_key,
       mime_type, file_size)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.publicId,
      input.applicationId,
      input.versionId,
      input.metadata.attachmentType,
      input.metadata.attachmentTypeOther,
      input.metadata.description,
      input.upload.originalFilename,
      input.storageKey,
      input.upload.mimeType,
      input.upload.fileSize,
    ],
  );
}

export const ApplicationSubmissionRepository = {
  findAvailableAdvisor,
  createApplication,
  createParticipants,
  createCompetitionDetail,
  createProjectDetail,
  createCertificateDetail,
  createExhibitionDetail,
  createVersion,
  createAttachment,
};
