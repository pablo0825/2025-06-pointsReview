-- Up Migration

-- Competition point rules: points by competition level and award.
CREATE TABLE competition_point_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_level VARCHAR(40) NOT NULL,
  award VARCHAR(30) NOT NULL,
  allocation_method VARCHAR(20) NOT NULL,
  points NUMERIC(10, 2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT competition_point_rules_competition_level_check
    CHECK (competition_level IN (
      'international_integrated',
      'international_non_integrated',
      'national_integrated',
      'national_non_integrated',
      'other'
    )),

  CONSTRAINT competition_point_rules_award_check
    CHECK (award IN (
      'first_place',
      'second_place',
      'third_place',
      'honorable_mention',
      'other_award',
      'finalist',
      'participation'
    )),

  CONSTRAINT competition_point_rules_allocation_method_check
    CHECK (allocation_method IN ('per_person', 'shared_total')),

  CONSTRAINT competition_point_rules_points_check
    CHECK (points >= 0),

  CONSTRAINT competition_point_rules_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

ALTER TABLE competition_point_rules
ADD CONSTRAINT competition_point_rules_no_overlap
EXCLUDE USING gist (
  competition_level WITH =,
  award WITH =,
  daterange(effective_from, effective_to, '[)') WITH &&
);

CREATE TRIGGER competition_point_rules_set_updated_at
BEFORE UPDATE ON competition_point_rules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Project participation point rules: points calculated from salary units.
CREATE TABLE project_point_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salary_unit BIGINT NOT NULL,
  points_per_unit NUMERIC(10, 2) NOT NULL,
  rounding_method VARCHAR(20) NOT NULL,
  maximum_points NUMERIC(10, 2),
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT project_point_rules_salary_unit_check
    CHECK (salary_unit > 0),

  CONSTRAINT project_point_rules_points_per_unit_check
    CHECK (points_per_unit > 0),

  CONSTRAINT project_point_rules_rounding_method_check
    CHECK (rounding_method IN ('floor')),

  CONSTRAINT project_point_rules_maximum_points_check
    CHECK (maximum_points IS NULL OR maximum_points >= 0),

  CONSTRAINT project_point_rules_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

ALTER TABLE project_point_rules
ADD CONSTRAINT project_point_rules_no_overlap
EXCLUDE USING gist (
  daterange(effective_from, effective_to, '[)') WITH &&
);

CREATE TRIGGER project_point_rules_set_updated_at
BEFORE UPDATE ON project_point_rules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Certificate point rules: points per certificate and per-student cap.
CREATE TABLE certificate_point_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  points_per_certificate NUMERIC(10, 2) NOT NULL,
  maximum_points_per_student NUMERIC(10, 2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT certificate_point_rules_points_per_certificate_check
    CHECK (points_per_certificate > 0),

  CONSTRAINT certificate_point_rules_maximum_points_per_student_check
    CHECK (maximum_points_per_student > 0),

  CONSTRAINT certificate_point_rules_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

ALTER TABLE certificate_point_rules
ADD CONSTRAINT certificate_point_rules_no_overlap
EXCLUDE USING gist (
  daterange(effective_from, effective_to, '[)') WITH &&
);

CREATE TRIGGER certificate_point_rules_set_updated_at
BEFORE UPDATE ON certificate_point_rules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- External exhibition point rules: point range by exhibition type.
CREATE TABLE exhibition_point_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exhibition_type VARCHAR(40) NOT NULL,
  minimum_points_per_person NUMERIC(10, 2) NOT NULL,
  maximum_points_per_person NUMERIC(10, 2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT exhibition_point_rules_exhibition_type_check
    CHECK (exhibition_type IN (
      'fan_work',
      'project_work'
    )),

  CONSTRAINT exhibition_point_rules_minimum_points_check
    CHECK (minimum_points_per_person >= 0),

  CONSTRAINT exhibition_point_rules_maximum_points_check
    CHECK (maximum_points_per_person >= minimum_points_per_person),

  CONSTRAINT exhibition_point_rules_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

ALTER TABLE exhibition_point_rules
ADD CONSTRAINT exhibition_point_rules_no_overlap
EXCLUDE USING gist (
  exhibition_type WITH =,
  daterange(effective_from, effective_to, '[)') WITH &&
);

CREATE TRIGGER exhibition_point_rules_set_updated_at
BEFORE UPDATE ON exhibition_point_rules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS exhibition_point_rules_set_updated_at ON exhibition_point_rules;
DROP TABLE IF EXISTS exhibition_point_rules;

DROP TRIGGER IF EXISTS certificate_point_rules_set_updated_at ON certificate_point_rules;
DROP TABLE IF EXISTS certificate_point_rules;

DROP TRIGGER IF EXISTS project_point_rules_set_updated_at ON project_point_rules;
DROP TABLE IF EXISTS project_point_rules;

DROP TRIGGER IF EXISTS competition_point_rules_set_updated_at ON competition_point_rules;
DROP TABLE IF EXISTS competition_point_rules;
