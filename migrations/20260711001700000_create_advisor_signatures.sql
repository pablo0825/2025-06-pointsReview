-- Up Migration

CREATE TABLE advisor_signatures (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_version_id BIGINT NOT NULL,
  advisor_user_id BIGINT NOT NULL,
  signature_storage_key TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,
  invalidated_at TIMESTAMPTZ,
  invalidated_reason TEXT,
  ip_address INET NOT NULL,
  user_agent TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT advisor_signatures_invalidation_pair_check
    CHECK (
      (invalidated_at IS NULL AND invalidated_reason IS NULL)
      OR
      (invalidated_at IS NOT NULL AND invalidated_reason IS NOT NULL)
    ),

  CONSTRAINT advisor_signatures_application_version_fk
    FOREIGN KEY (application_version_id) REFERENCES application_versions (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT advisor_signatures_advisor_user_fk
    FOREIGN KEY (advisor_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX one_valid_signature_per_version
ON advisor_signatures (application_version_id)
WHERE invalidated_at IS NULL;

-- Down Migration

DROP TABLE IF EXISTS advisor_signatures;
