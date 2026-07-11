-- Up Migration

CREATE TABLE point_applications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  application_type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL,
  advisor_id BIGINT NOT NULL,
  application_participant_rule_id BIGINT NOT NULL,
  applicant_name VARCHAR(100) NOT NULL,
  applicant_email VARCHAR(320) NOT NULL,
  applicant_phone VARCHAR(30) NOT NULL,
  requested_total_points NUMERIC(10, 2) NOT NULL,
  approved_total_points NUMERIC(10, 2),
  current_version_id BIGINT,
  edit_token_hash BYTEA,
  edit_token_expires_at TIMESTAMPTZ,
  advisor_confirmation_expires_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT point_applications_application_type_check
    CHECK (application_type IN (
      'competition',
      'certificate',
      'project_participation',
      'external_exhibition'
    )),

  CONSTRAINT point_applications_status_check
    CHECK (status IN (
      'pending_advisor',
      'under_review',
      'needs_revision',
      'approved',
      'rejected'
    )),

  CONSTRAINT point_applications_requested_total_points_check
    CHECK (requested_total_points >= 0),

  CONSTRAINT point_applications_approved_total_points_check
    CHECK (approved_total_points IS NULL OR approved_total_points >= 0),

  CONSTRAINT point_applications_applicant_email_normalized_check
    CHECK (applicant_email = LOWER(BTRIM(applicant_email))),

  CONSTRAINT point_applications_edit_token_pair_check
    CHECK (
      (edit_token_hash IS NULL AND edit_token_expires_at IS NULL)
      OR
      (edit_token_hash IS NOT NULL AND edit_token_expires_at IS NOT NULL)
    ),

  CONSTRAINT point_applications_closed_at_check
    CHECK (
      (status IN ('approved', 'rejected') AND closed_at IS NOT NULL)
      OR
      (status NOT IN ('approved', 'rejected') AND closed_at IS NULL)
    ),

  CONSTRAINT point_applications_advisor_confirmation_expires_at_check
    CHECK (
      status <> 'pending_advisor'
      OR advisor_confirmation_expires_at IS NOT NULL
    ),

  CONSTRAINT point_applications_advisor_fk
    FOREIGN KEY (advisor_id) REFERENCES advisors (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT point_applications_participant_rule_fk
    FOREIGN KEY (application_participant_rule_id, application_type)
    REFERENCES application_type_participant_rules (id, application_type)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX point_applications_public_id_unique
ON point_applications (public_id);

CREATE UNIQUE INDEX point_applications_edit_token_hash_unique
ON point_applications (edit_token_hash)
WHERE edit_token_hash IS NOT NULL;

CREATE INDEX idx_point_applications_status_submitted_at
ON point_applications (status, submitted_at);

CREATE INDEX idx_point_applications_advisor_status
ON point_applications (advisor_id, status);

CREATE INDEX idx_point_applications_advisor_confirmation_expiry
ON point_applications (advisor_confirmation_expires_at)
WHERE status = 'pending_advisor';

CREATE TRIGGER point_applications_set_updated_at
BEFORE UPDATE ON point_applications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS point_applications_set_updated_at ON point_applications;
DROP TABLE IF EXISTS point_applications;
