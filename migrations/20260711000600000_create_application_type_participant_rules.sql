-- Up Migration

CREATE TABLE application_type_participant_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_type VARCHAR(30) NOT NULL,
  minimum_participants SMALLINT NOT NULL,
  maximum_participants SMALLINT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_type_participant_rules_application_type_check
    CHECK (application_type IN (
      'competition',
      'certificate',
      'project_participation',
      'external_exhibition'
    )),

  CONSTRAINT application_type_participant_rules_minimum_check
    CHECK (minimum_participants >= 1),

  CONSTRAINT application_type_participant_rules_maximum_check
    CHECK (maximum_participants >= minimum_participants),

  CONSTRAINT application_type_participant_rules_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),

  CONSTRAINT application_type_participant_rules_id_type_unique
    UNIQUE (id, application_type)
);

ALTER TABLE application_type_participant_rules
ADD CONSTRAINT application_type_participant_rules_no_overlap
EXCLUDE USING gist (
  application_type WITH =,
  daterange(effective_from, effective_to, '[)') WITH &&
);

CREATE TRIGGER application_type_participant_rules_set_updated_at
BEFORE UPDATE ON application_type_participant_rules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS application_type_participant_rules_set_updated_at
ON application_type_participant_rules;
DROP TABLE IF EXISTS application_type_participant_rules;
