-- Up Migration

CREATE VIEW student_points_summary AS
WITH latest_snapshot AS (
  SELECT DISTINCT ON (
    academic_year_snapshot,
    grade_snapshot,
    class_number_snapshot,
    student_number
  )
    academic_year_snapshot AS academic_year,
    grade_snapshot AS grade,
    class_number_snapshot AS class_number,
    student_number,
    student_name_snapshot AS student_name
  FROM student_point_transactions
  ORDER BY
    academic_year_snapshot,
    grade_snapshot,
    class_number_snapshot,
    student_number,
    created_at DESC
)
SELECT
  t.academic_year_snapshot AS academic_year,
  t.grade_snapshot AS grade,
  t.class_number_snapshot AS class_number,
  t.student_number,
  ls.student_name,
  COALESCE(SUM(t.points) FILTER (
    WHERE t.point_category = 'competition'
  ), 0) AS competition_points,
  COALESCE(SUM(t.points) FILTER (
    WHERE t.point_category = 'project_participation'
  ), 0) AS project_participation_points,
  COALESCE(SUM(t.points) FILTER (
    WHERE t.point_category = 'certificate'
  ), 0) AS certificate_points,
  COALESCE(SUM(t.points) FILTER (
    WHERE t.point_category = 'external_exhibition'
  ), 0) AS external_exhibition_points,
  COALESCE(SUM(t.points), 0) AS total_points,
  MAX(t.created_at) AS updated_at
FROM student_point_transactions t
JOIN latest_snapshot ls
  ON ls.academic_year = t.academic_year_snapshot
  AND ls.grade = t.grade_snapshot
  AND ls.class_number = t.class_number_snapshot
  AND ls.student_number = t.student_number
GROUP BY
  t.academic_year_snapshot,
  t.grade_snapshot,
  t.class_number_snapshot,
  t.student_number,
  ls.student_name;

-- Down Migration

DROP VIEW IF EXISTS student_points_summary;
