-- Initial participant and point rules for local development.

WITH seed_rules (
  application_type,
  minimum_participants,
  maximum_participants,
  effective_from,
  effective_to
) AS (
  VALUES
    ('competition', 1, 10, DATE '2025-08-01', NULL::date),
    ('project_participation', 1, 1, DATE '2025-08-01', NULL::date),
    ('certificate', 1, 1, DATE '2025-08-01', NULL::date),
    ('external_exhibition', 1, 15, DATE '2025-08-01', NULL::date)
)
INSERT INTO application_type_participant_rules (
  application_type,
  minimum_participants,
  maximum_participants,
  effective_from,
  effective_to
)
SELECT
  seed_rules.application_type,
  seed_rules.minimum_participants,
  seed_rules.maximum_participants,
  seed_rules.effective_from,
  seed_rules.effective_to
FROM seed_rules
WHERE NOT EXISTS (
  SELECT 1
  FROM application_type_participant_rules existing_rules
  WHERE existing_rules.application_type = seed_rules.application_type
    AND existing_rules.effective_from = seed_rules.effective_from
);

WITH seed_rules (
  competition_level,
  award,
  allocation_method,
  points,
  effective_from,
  effective_to
) AS (
  VALUES
    ('international_integrated', 'participation', 'per_person', 1.00, DATE '2025-08-01', NULL::date),
    ('international_integrated', 'finalist', 'per_person', 10.00, DATE '2025-08-01', NULL::date),
    ('international_integrated', 'honorable_mention', 'shared_total', 60.00, DATE '2025-08-01', NULL::date),
    ('international_integrated', 'third_place', 'shared_total', 80.00, DATE '2025-08-01', NULL::date),
    ('international_integrated', 'second_place', 'shared_total', 100.00, DATE '2025-08-01', NULL::date),
    ('international_integrated', 'first_place', 'shared_total', 120.00, DATE '2025-08-01', NULL::date),
    ('international_non_integrated', 'participation', 'per_person', 0.50, DATE '2025-08-01', NULL::date),
    ('international_non_integrated', 'finalist', 'per_person', 2.00, DATE '2025-08-01', NULL::date),
    ('international_non_integrated', 'honorable_mention', 'shared_total', 5.00, DATE '2025-08-01', NULL::date),
    ('international_non_integrated', 'third_place', 'shared_total', 10.00, DATE '2025-08-01', NULL::date),
    ('international_non_integrated', 'second_place', 'shared_total', 15.00, DATE '2025-08-01', NULL::date),
    ('international_non_integrated', 'first_place', 'shared_total', 25.00, DATE '2025-08-01', NULL::date),
    ('national_integrated', 'participation', 'per_person', 0.50, DATE '2025-08-01', NULL::date),
    ('national_integrated', 'finalist', 'per_person', 3.00, DATE '2025-08-01', NULL::date),
    ('national_integrated', 'honorable_mention', 'shared_total', 25.00, DATE '2025-08-01', NULL::date),
    ('national_integrated', 'third_place', 'shared_total', 30.00, DATE '2025-08-01', NULL::date),
    ('national_integrated', 'second_place', 'shared_total', 40.00, DATE '2025-08-01', NULL::date),
    ('national_integrated', 'first_place', 'shared_total', 60.00, DATE '2025-08-01', NULL::date),
    ('national_non_integrated', 'participation', 'per_person', 0.50, DATE '2025-08-01', NULL::date),
    ('national_non_integrated', 'finalist', 'per_person', 1.50, DATE '2025-08-01', NULL::date),
    ('national_non_integrated', 'honorable_mention', 'shared_total', 3.00, DATE '2025-08-01', NULL::date),
    ('national_non_integrated', 'third_place', 'shared_total', 5.00, DATE '2025-08-01', NULL::date),
    ('national_non_integrated', 'second_place', 'shared_total', 10.00, DATE '2025-08-01', NULL::date),
    ('national_non_integrated', 'first_place', 'shared_total', 20.00, DATE '2025-08-01', NULL::date),
    ('other', 'participation', 'per_person', 0.50, DATE '2025-08-01', NULL::date),
    ('other', 'finalist', 'per_person', 0.50, DATE '2025-08-01', NULL::date),
    ('other', 'honorable_mention', 'shared_total', 1.00, DATE '2025-08-01', NULL::date),
    ('other', 'third_place', 'shared_total', 2.00, DATE '2025-08-01', NULL::date),
    ('other', 'second_place', 'shared_total', 3.00, DATE '2025-08-01', NULL::date),
    ('other', 'first_place', 'shared_total', 4.00, DATE '2025-08-01', NULL::date)
)
INSERT INTO competition_point_rules (
  competition_level,
  award,
  allocation_method,
  points,
  effective_from,
  effective_to
)
SELECT
  seed_rules.competition_level,
  seed_rules.award,
  seed_rules.allocation_method,
  seed_rules.points,
  seed_rules.effective_from,
  seed_rules.effective_to
FROM seed_rules
WHERE NOT EXISTS (
  SELECT 1
  FROM competition_point_rules existing_rules
  WHERE existing_rules.competition_level = seed_rules.competition_level
    AND existing_rules.award = seed_rules.award
    AND existing_rules.effective_from = seed_rules.effective_from
);

WITH seed_rules (
  salary_unit,
  points_per_unit,
  rounding_method,
  maximum_points,
  effective_from,
  effective_to
) AS (
  VALUES
    (1000, 0.50, 'floor', NULL::numeric, DATE '2025-08-01', NULL::date)
)
INSERT INTO project_point_rules (
  salary_unit,
  points_per_unit,
  rounding_method,
  maximum_points,
  effective_from,
  effective_to
)
SELECT
  seed_rules.salary_unit,
  seed_rules.points_per_unit,
  seed_rules.rounding_method,
  seed_rules.maximum_points,
  seed_rules.effective_from,
  seed_rules.effective_to
FROM seed_rules
WHERE NOT EXISTS (
  SELECT 1
  FROM project_point_rules existing_rules
  WHERE existing_rules.effective_from = seed_rules.effective_from
);

WITH seed_rules (
  points_per_certificate,
  maximum_points_per_student,
  effective_from,
  effective_to
) AS (
  VALUES
    (2.00, 4.00, DATE '2025-08-01', NULL::date)
)
INSERT INTO certificate_point_rules (
  points_per_certificate,
  maximum_points_per_student,
  effective_from,
  effective_to
)
SELECT
  seed_rules.points_per_certificate,
  seed_rules.maximum_points_per_student,
  seed_rules.effective_from,
  seed_rules.effective_to
FROM seed_rules
WHERE NOT EXISTS (
  SELECT 1
  FROM certificate_point_rules existing_rules
  WHERE existing_rules.effective_from = seed_rules.effective_from
);

WITH seed_rules (
  exhibition_type,
  minimum_points_per_person,
  maximum_points_per_person,
  effective_from,
  effective_to
) AS (
  VALUES
    ('fan_work', 0.50, 1.00, DATE '2025-08-01', NULL::date),
    ('project_work', 1.00, 2.00, DATE '2025-08-01', NULL::date)
)
INSERT INTO exhibition_point_rules (
  exhibition_type,
  minimum_points_per_person,
  maximum_points_per_person,
  effective_from,
  effective_to
)
SELECT
  seed_rules.exhibition_type,
  seed_rules.minimum_points_per_person,
  seed_rules.maximum_points_per_person,
  seed_rules.effective_from,
  seed_rules.effective_to
FROM seed_rules
WHERE NOT EXISTS (
  SELECT 1
  FROM exhibition_point_rules existing_rules
  WHERE existing_rules.exhibition_type = seed_rules.exhibition_type
    AND existing_rules.effective_from = seed_rules.effective_from
);
