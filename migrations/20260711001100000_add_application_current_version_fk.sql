-- Up Migration

ALTER TABLE application_versions
ADD CONSTRAINT application_versions_id_application_unique
UNIQUE (id, application_id);

ALTER TABLE point_applications
ADD CONSTRAINT point_applications_current_version_fk
FOREIGN KEY (current_version_id, id)
REFERENCES application_versions (id, application_id)
ON DELETE RESTRICT
ON UPDATE RESTRICT;

-- Down Migration

ALTER TABLE point_applications
DROP CONSTRAINT IF EXISTS point_applications_current_version_fk;

ALTER TABLE application_versions
DROP CONSTRAINT IF EXISTS application_versions_id_application_unique;
