-- Up Migration

CREATE TABLE application_instructions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_type VARCHAR(30) NOT NULL,
  section_key VARCHAR(80) NOT NULL,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_instructions_application_type_check
    CHECK (application_type IN (
      'competition',
      'certificate',
      'project_participation',
      'external_exhibition'
    )),

  CONSTRAINT application_instructions_section_key_check
    CHECK (section_key = LOWER(BTRIM(section_key)) AND section_key <> ''),

  CONSTRAINT application_instructions_title_check
    CHECK (BTRIM(title) <> ''),

  CONSTRAINT application_instructions_content_check
    CHECK (BTRIM(content) <> ''),

  CONSTRAINT application_instructions_display_order_check
    CHECK (display_order >= 0),

  CONSTRAINT application_instructions_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),

  CONSTRAINT application_instructions_section_unique
    UNIQUE (application_type, section_key)
);

CREATE INDEX idx_application_instructions_visible
ON application_instructions (application_type, display_order, section_key)
WHERE is_visible = TRUE;

CREATE TRIGGER application_instructions_set_updated_at
BEFORE UPDATE ON application_instructions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS application_instructions_set_updated_at
ON application_instructions;
DROP TABLE IF EXISTS application_instructions;
