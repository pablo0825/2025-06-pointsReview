-- Up Migration

CREATE TABLE application_participants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  academic_year VARCHAR(10) NOT NULL,
  grade SMALLINT NOT NULL,
  class_number SMALLINT NOT NULL,
  student_number VARCHAR(50) NOT NULL,
  student_name VARCHAR(100) NOT NULL,
  requested_points NUMERIC(10, 2) NOT NULL,
  approved_points NUMERIC(10, 2),
  is_applicant BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_participants_requested_points_check
    CHECK (requested_points > 0),

  CONSTRAINT application_participants_approved_points_check
    CHECK (approved_points IS NULL OR approved_points >= 0),

  CONSTRAINT application_participants_grade_check
    CHECK (grade BETWEEN 1 AND 6),

  CONSTRAINT application_participants_class_number_check
    CHECK (class_number BETWEEN 1 AND 5),

  CONSTRAINT application_participants_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT application_participants_application_student_unique
    UNIQUE (application_id, student_number),

  CONSTRAINT application_participants_id_application_unique
    UNIQUE (id, application_id)
);

CREATE UNIQUE INDEX one_applicant_per_application
ON application_participants (application_id)
WHERE is_applicant = TRUE;

CREATE TRIGGER application_participants_set_updated_at
BEFORE UPDATE ON application_participants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS application_participants_set_updated_at
ON application_participants;
DROP TABLE IF EXISTS application_participants;
