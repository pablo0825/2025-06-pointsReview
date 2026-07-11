-- Up Migration

CREATE TABLE application_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  version_number SMALLINT NOT NULL,
  application_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_versions_version_number_check
    CHECK (version_number >= 1),

  CONSTRAINT application_versions_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT application_versions_application_version_unique
    UNIQUE (application_id, version_number)
);

-- Down Migration

DROP TABLE IF EXISTS application_versions;
