-- Up Migration

ALTER TABLE application_instructions
DROP CONSTRAINT application_instructions_section_unique;

ALTER TABLE application_instructions
ADD CONSTRAINT application_instructions_section_version_unique
UNIQUE (application_type, section_key, effective_from);

ALTER TABLE application_instructions
ADD CONSTRAINT application_instructions_section_no_overlap
EXCLUDE USING gist (
  application_type WITH =,
  section_key WITH =,
  daterange(effective_from, effective_to, '[)') WITH &&
);

-- Down Migration

ALTER TABLE application_instructions
DROP CONSTRAINT application_instructions_section_no_overlap;

ALTER TABLE application_instructions
DROP CONSTRAINT application_instructions_section_version_unique;

ALTER TABLE application_instructions
ADD CONSTRAINT application_instructions_section_unique
UNIQUE (application_type, section_key);
