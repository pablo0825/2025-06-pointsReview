-- Up Migration

-- Competition application details: competition-specific submitted and approved fields.
CREATE TABLE competition_application_details (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  competition_level_requested VARCHAR(40) NOT NULL,
  competition_level_other VARCHAR(100),
  competition_level_approved VARCHAR(40),
  competition_level_approved_other VARCHAR(100),
  competition_point_rule_id BIGINT NOT NULL,
  competition_name VARCHAR(255) NOT NULL,
  competition_category VARCHAR(100) NOT NULL,
  award VARCHAR(30) NOT NULL,
  award_other VARCHAR(100),
  competition_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT competition_application_details_level_requested_check
    CHECK (competition_level_requested IN (
      'international_integrated',
      'international_non_integrated',
      'national_integrated',
      'national_non_integrated',
      'other'
    )),

  CONSTRAINT competition_application_details_level_approved_check
    CHECK (
      competition_level_approved IS NULL
      OR competition_level_approved IN (
        'international_integrated',
        'international_non_integrated',
        'national_integrated',
        'national_non_integrated',
        'other'
      )
    ),

  CONSTRAINT competition_application_details_level_other_pair_check
    CHECK (
      (competition_level_requested = 'other' AND competition_level_other IS NOT NULL)
      OR
      (competition_level_requested <> 'other' AND competition_level_other IS NULL)
    ),

  CONSTRAINT competition_application_details_level_approved_other_pair_check
    CHECK (
      (competition_level_approved IS NULL AND competition_level_approved_other IS NULL)
      OR
      (competition_level_approved = 'other' AND competition_level_approved_other IS NOT NULL)
      OR
      (competition_level_approved IS NOT NULL
       AND competition_level_approved <> 'other'
       AND competition_level_approved_other IS NULL)
    ),

  CONSTRAINT competition_application_details_award_check
    CHECK (award IN (
      'first_place',
      'second_place',
      'third_place',
      'honorable_mention',
      'other_award',
      'finalist',
      'participation'
    )),

  CONSTRAINT competition_application_details_award_other_pair_check
    CHECK (
      (award = 'other_award' AND award_other IS NOT NULL)
      OR
      (award <> 'other_award' AND award_other IS NULL)
    ),

  CONSTRAINT competition_application_details_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT competition_application_details_rule_fk
    FOREIGN KEY (competition_point_rule_id) REFERENCES competition_point_rules (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT competition_application_details_application_unique
    UNIQUE (application_id)
);

CREATE TRIGGER competition_application_details_set_updated_at
BEFORE UPDATE ON competition_application_details
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Project participation details: project metadata, total salary, and calculated points.
CREATE TABLE project_participation_details (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  project_point_rule_id BIGINT NOT NULL,
  project_name VARCHAR(255) NOT NULL,
  principal_investigator VARCHAR(100) NOT NULL,
  work_description TEXT NOT NULL,
  total_salary BIGINT NOT NULL,
  calculated_points NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT project_participation_details_total_salary_check
    CHECK (total_salary > 0),

  CONSTRAINT project_participation_details_calculated_points_check
    CHECK (calculated_points >= 0),

  CONSTRAINT project_participation_details_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT project_participation_details_rule_fk
    FOREIGN KEY (project_point_rule_id) REFERENCES project_point_rules (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT project_participation_details_application_unique
    UNIQUE (application_id)
);

CREATE TRIGGER project_participation_details_set_updated_at
BEFORE UPDATE ON project_participation_details
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Project participation salary items: monthly salary breakdown for a project application.
CREATE TABLE project_participation_salary_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_participation_detail_id BIGINT NOT NULL,
  salary_month DATE NOT NULL,
  salary_amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT project_participation_salary_items_month_first_day_check
    CHECK (EXTRACT(DAY FROM salary_month) = 1),

  CONSTRAINT project_participation_salary_items_salary_amount_check
    CHECK (salary_amount > 0),

  CONSTRAINT project_participation_salary_items_detail_fk
    FOREIGN KEY (project_participation_detail_id)
    REFERENCES project_participation_details (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT project_participation_salary_items_unique_month
    UNIQUE (project_participation_detail_id, salary_month)
);

CREATE TRIGGER project_participation_salary_items_set_updated_at
BEFORE UPDATE ON project_participation_salary_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Certificate application details: certificate metadata and applied certificate rule.
CREATE TABLE certificate_application_details (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  certificate_point_rule_id BIGINT NOT NULL,
  certificate_name VARCHAR(255) NOT NULL,
  issuing_organization VARCHAR(255) NOT NULL,
  certificate_number VARCHAR(100) NOT NULL,
  issued_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT certificate_application_details_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT certificate_application_details_rule_fk
    FOREIGN KEY (certificate_point_rule_id) REFERENCES certificate_point_rules (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT certificate_application_details_application_unique
    UNIQUE (application_id)
);

CREATE TRIGGER certificate_application_details_set_updated_at
BEFORE UPDATE ON certificate_application_details
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- External exhibition details: exhibition metadata and applied exhibition rule.
CREATE TABLE external_exhibition_details (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  exhibition_point_rule_id BIGINT NOT NULL,
  exhibition_type VARCHAR(40) NOT NULL,
  work_name VARCHAR(255) NOT NULL,
  exhibition_name VARCHAR(50) NOT NULL,
  exhibition_name_other VARCHAR(255),
  organizer VARCHAR(255) NOT NULL,
  venue VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT external_exhibition_details_exhibition_type_check
    CHECK (exhibition_type IN (
      'fan_work',
      'project_work'
    )),

  CONSTRAINT external_exhibition_details_exhibition_name_check
    CHECK (exhibition_name IN (
      'campus_exhibition',
      'young_designers_exhibition',
      'vision_get_wild',
      'young_designers_exhibition_taiwan',
      'a_plus_creative_festival',
      'moe_project_competition',
      'other'
    )),

  CONSTRAINT external_exhibition_details_exhibition_name_other_pair_check
    CHECK (
      (exhibition_name = 'other' AND exhibition_name_other IS NOT NULL)
      OR
      (exhibition_name <> 'other' AND exhibition_name_other IS NULL)
    ),

  CONSTRAINT external_exhibition_details_date_range_check
    CHECK (end_date >= start_date),

  CONSTRAINT external_exhibition_details_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT external_exhibition_details_rule_fk
    FOREIGN KEY (exhibition_point_rule_id) REFERENCES exhibition_point_rules (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT external_exhibition_details_application_unique
    UNIQUE (application_id)
);

CREATE TRIGGER external_exhibition_details_set_updated_at
BEFORE UPDATE ON external_exhibition_details
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS external_exhibition_details_set_updated_at ON external_exhibition_details;
DROP TABLE IF EXISTS external_exhibition_details;

DROP TRIGGER IF EXISTS certificate_application_details_set_updated_at ON certificate_application_details;
DROP TABLE IF EXISTS certificate_application_details;

DROP TRIGGER IF EXISTS project_participation_salary_items_set_updated_at ON project_participation_salary_items;
DROP TABLE IF EXISTS project_participation_salary_items;

DROP TRIGGER IF EXISTS project_participation_details_set_updated_at ON project_participation_details;
DROP TABLE IF EXISTS project_participation_details;

DROP TRIGGER IF EXISTS competition_application_details_set_updated_at ON competition_application_details;
DROP TABLE IF EXISTS competition_application_details;
