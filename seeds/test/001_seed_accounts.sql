-- Test-only accounts. Password: PointsReview-Dev-2026!

INSERT INTO users (
  display_name,
  email,
  password_hash,
  role,
  is_active,
  activated_at
)
VALUES
  (
    '測試管理員',
    'admin@example.test',
    '$argon2id$v=19$m=65536,t=3,p=1$ZiMZGwh2ifANz0Mm78+MVw$zNlIaH1OJqwOlrak00tvCvaqTniWCQHxL/mSy1L/OLA',
    'admin',
    TRUE,
    TIMESTAMPTZ '2026-01-01T00:00:00Z'
  ),
  (
    '測試承辦人',
    'reviewer@example.test',
    '$argon2id$v=19$m=65536,t=3,p=1$ZiMZGwh2ifANz0Mm78+MVw$zNlIaH1OJqwOlrak00tvCvaqTniWCQHxL/mSy1L/OLA',
    'reviewer',
    TRUE,
    TIMESTAMPTZ '2026-01-01T00:00:00Z'
  ),
  (
    '測試指導老師',
    'advisor@example.test',
    '$argon2id$v=19$m=65536,t=3,p=1$ZiMZGwh2ifANz0Mm78+MVw$zNlIaH1OJqwOlrak00tvCvaqTniWCQHxL/mSy1L/OLA',
    'advisor',
    TRUE,
    TIMESTAMPTZ '2026-01-01T00:00:00Z'
  )
ON CONFLICT (email) DO NOTHING;

INSERT INTO advisors (
  user_id,
  employee_number,
  name,
  title_code,
  department,
  is_director,
  is_active
)
SELECT
  users.id,
  'TEST-T001',
  '測試指導老師',
  6,
  '多媒體設計系',
  TRUE,
  TRUE
FROM users
WHERE users.email = 'advisor@example.test'
  AND NOT EXISTS (
    SELECT 1
    FROM advisors
    WHERE advisors.user_id = users.id
  );
