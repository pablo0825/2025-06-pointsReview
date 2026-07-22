import type {
  AdvisorApplicationDetailRow,
  AdvisorApplicationListRow,
  AdvisorAttachmentRow,
  AdvisorParticipantRow,
  AdvisorReviewActionRow,
  AdvisorSignatureRow,
  AdvisorVersionRow,
} from "../repositories/advisorApplication.repository";

export function toAdvisorApplicationListItem(row: AdvisorApplicationListRow) {
  return {
    publicId: row.public_id,
    applicationType: row.application_type,
    status: row.status,
    applicantName: row.applicant_name,
    applicantEmail: row.applicant_email,
    advisorName: row.advisor_name,
    requestedTotalPoints: row.requested_total_points,
    approvedTotalPoints: row.approved_total_points,
    submittedAt: row.submitted_at.toISOString(),
    advisorConfirmationExpiresAt:
      row.advisor_confirmation_expires_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toAdvisorParticipant(row: AdvisorParticipantRow) {
  return {
    id: Number(row.id),
    academicYear: row.academic_year,
    grade: row.grade,
    classNumber: row.class_number,
    studentNumber: row.student_number,
    studentName: row.student_name,
    requestedPoints: row.requested_points,
    approvedPoints: row.approved_points,
    isApplicant: row.is_applicant,
  };
}

export function toAdvisorAttachment(row: AdvisorAttachmentRow) {
  return {
    publicId: row.public_id,
    attachmentType: row.attachment_type,
    attachmentTypeOther: row.attachment_type_other,
    description: row.description,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    createdAt: row.created_at.toISOString(),
  };
}

export function toAdvisorApplicationDetail(
  row: AdvisorApplicationDetailRow,
  participants: AdvisorParticipantRow[],
  attachments: AdvisorAttachmentRow[],
) {
  return {
    publicId: row.public_id,
    applicationType: row.application_type,
    status: row.status,
    applicantName: row.applicant_name,
    applicantEmail: row.applicant_email,
    applicantPhone: row.applicant_phone,
    requestedTotalPoints: row.requested_total_points,
    approvedTotalPoints: row.approved_total_points,
    submittedAt: row.submitted_at.toISOString(),
    advisorConfirmationExpiresAt:
      row.advisor_confirmation_expires_at.toISOString(),
    participants: participants.map(toAdvisorParticipant),
    typeDetails: row.current_version_snapshot.typeDetails ?? {},
    attachments: attachments.map(toAdvisorAttachment),
    currentVersion: {
      id: Number(row.current_version_id),
      versionNumber: row.current_version_number,
      createdAt: row.current_version_created_at.toISOString(),
    },
  };
}

export function toAdvisorVersion(
  row: AdvisorVersionRow,
  attachments: AdvisorAttachmentRow[],
) {
  return {
    id: Number(row.id),
    versionNumber: row.version_number,
    applicationSnapshot: row.application_snapshot,
    attachments: attachments
      .filter((item) => item.application_version_id === row.id)
      .map(toAdvisorAttachment),
    createdAt: row.created_at.toISOString(),
  };
}

export function toAdvisorReviewAction(row: AdvisorReviewActionRow) {
  return {
    id: Number(row.id),
    actionType: row.action_type,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

export function toAdvisorSignature(row: AdvisorSignatureRow) {
  return {
    id: Number(row.id),
    applicationVersionId: Number(row.application_version_id),
    versionNumber: row.version_number,
    signedAt: row.signed_at.toISOString(),
    isValid: row.invalidated_at === null,
    invalidatedAt: row.invalidated_at?.toISOString() ?? null,
    invalidatedReason: row.invalidated_reason,
    createdAt: row.created_at.toISOString(),
  };
}
