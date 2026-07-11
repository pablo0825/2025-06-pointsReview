-- Up Migration

CREATE TABLE student_point_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_number VARCHAR(50) NOT NULL,
  student_name_snapshot VARCHAR(100) NOT NULL,
  academic_year_snapshot VARCHAR(10) NOT NULL,
  grade_snapshot SMALLINT NOT NULL,
  class_number_snapshot SMALLINT NOT NULL,
  application_id BIGINT NOT NULL,
  participant_id BIGINT NOT NULL,
  point_category VARCHAR(30) NOT NULL,
  points NUMERIC(10, 2) NOT NULL,
  transaction_type VARCHAR(20) NOT NULL,
  related_transaction_id BIGINT,
  reason TEXT,
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT student_point_transactions_point_category_check
    CHECK (point_category IN (
      'competition',
      'certificate',
      'project_participation',
      'external_exhibition'
    )),

  CONSTRAINT student_point_transactions_transaction_type_check
    CHECK (transaction_type IN ('award', 'adjustment', 'reversal')),

  CONSTRAINT student_point_transactions_related_pair_check
    CHECK (
      (transaction_type = 'award'
        AND related_transaction_id IS NULL
        AND reason IS NULL)
      OR
      (transaction_type IN ('adjustment', 'reversal')
        AND related_transaction_id IS NOT NULL
        AND reason IS NOT NULL)
    ),

  CONSTRAINT student_point_transactions_grade_snapshot_check
    CHECK (grade_snapshot BETWEEN 1 AND 6),

  CONSTRAINT student_point_transactions_class_number_snapshot_check
    CHECK (class_number_snapshot BETWEEN 1 AND 5),

  CONSTRAINT student_point_transactions_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_transactions_participant_application_fk
    FOREIGN KEY (participant_id, application_id)
    REFERENCES application_participants (id, application_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_transactions_related_fk
    FOREIGN KEY (related_transaction_id) REFERENCES student_point_transactions (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_transactions_created_by_user_fk
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);

CREATE INDEX idx_student_point_transactions_student_number
ON student_point_transactions (student_number);

CREATE INDEX idx_student_point_transactions_student_category
ON student_point_transactions (student_number, point_category);

CREATE INDEX idx_student_point_transactions_year_grade_class_number
ON student_point_transactions (
  academic_year_snapshot,
  grade_snapshot,
  class_number_snapshot
);

CREATE INDEX idx_student_point_transactions_year_student
ON student_point_transactions (academic_year_snapshot, student_number);

CREATE INDEX idx_student_point_transactions_application_id
ON student_point_transactions (application_id);

CREATE INDEX idx_student_point_transactions_related_transaction_id
ON student_point_transactions (related_transaction_id)
WHERE related_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX one_award_per_participant
ON student_point_transactions (participant_id)
WHERE transaction_type = 'award';

-- Down Migration

DROP TABLE IF EXISTS student_point_transactions;
