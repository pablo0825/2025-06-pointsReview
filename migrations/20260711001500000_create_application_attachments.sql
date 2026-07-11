-- Up Migration

CREATE TABLE application_attachments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  application_id BIGINT NOT NULL,
  application_version_id BIGINT NOT NULL,
  attachment_type VARCHAR(50) NOT NULL,
  attachment_type_other VARCHAR(100),
  description TEXT,
  original_filename VARCHAR(255) NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_attachments_attachment_type_check
    CHECK (attachment_type IN (
      'competition_rules',
      'competition_poster',
      'official_website_screenshot',
      'official_document',
      'participation_proof',
      'finalist_or_award_certificate',
      'salary_proof',
      'certificate_copy',
      'exhibition_photo',
      'exhibition_poster',
      'other'
    )),

  CONSTRAINT application_attachments_attachment_type_other_pair_check
    CHECK (
      (attachment_type = 'other' AND attachment_type_other IS NOT NULL)
      OR
      (attachment_type <> 'other' AND attachment_type_other IS NULL)
    ),

  CONSTRAINT application_attachments_file_size_check
    CHECK (file_size > 0),

  CONSTRAINT application_attachments_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT application_attachments_version_application_fk
    FOREIGN KEY (application_version_id, application_id)
    REFERENCES application_versions (id, application_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX application_attachments_public_id_unique
ON application_attachments (public_id);

CREATE UNIQUE INDEX application_attachments_version_storage_unique
ON application_attachments (application_version_id, storage_key);

CREATE INDEX idx_application_attachments_application_id
ON application_attachments (application_id);

-- Down Migration

DROP TABLE IF EXISTS application_attachments;
