-- Up Migration

CREATE TABLE advisors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  employee_number VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  title_code SMALLINT NOT NULL,
  department VARCHAR(100) NOT NULL,
  is_director BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT advisors_title_code_check
    CHECK (title_code BETWEEN 1 AND 7),

  CONSTRAINT advisors_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX advisors_user_id_unique
ON advisors (user_id);

CREATE UNIQUE INDEX advisors_employee_number_unique
ON advisors (employee_number);

CREATE UNIQUE INDEX one_active_director
ON advisors (is_director)
WHERE is_director = TRUE AND is_active = TRUE;

CREATE TRIGGER advisors_set_updated_at
BEFORE UPDATE ON advisors
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS advisors_set_updated_at ON advisors;
DROP TABLE IF EXISTS advisors;
