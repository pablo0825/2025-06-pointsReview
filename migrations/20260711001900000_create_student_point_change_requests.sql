-- Up Migration

CREATE TABLE student_point_change_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  target_transaction_id BIGINT NOT NULL,
  requested_by_user_id BIGINT NOT NULL,
  reviewed_by_user_id BIGINT,
  change_type VARCHAR(20) NOT NULL,
  requested_points NUMERIC(10, 2) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  reviewed_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_transaction_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT student_point_change_requests_change_type_check
    CHECK (change_type IN ('adjustment', 'reversal')),

  CONSTRAINT student_point_change_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected')),

  CONSTRAINT student_point_change_requests_requested_points_check
    CHECK (requested_points <> 0),

  CONSTRAINT student_point_change_requests_status_fields_check
    CHECK (
      (status = 'pending'
        AND reviewed_by_user_id IS NULL
        AND reviewed_at IS NULL
        AND reviewed_reason IS NULL
        AND created_transaction_id IS NULL)
      OR
      (status = 'approved'
        AND reviewed_by_user_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND created_transaction_id IS NOT NULL)
      OR
      (status = 'rejected'
        AND reviewed_by_user_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND reviewed_reason IS NOT NULL
        AND created_transaction_id IS NULL)
    ),

  CONSTRAINT student_point_change_requests_target_fk
    FOREIGN KEY (target_transaction_id) REFERENCES student_point_transactions (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_change_requests_requested_by_user_fk
    FOREIGN KEY (requested_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_change_requests_reviewed_by_user_fk
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_change_requests_created_transaction_fk
    FOREIGN KEY (created_transaction_id) REFERENCES student_point_transactions (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX student_point_change_requests_public_id_unique
ON student_point_change_requests (public_id);

CREATE UNIQUE INDEX one_pending_change_per_transaction
ON student_point_change_requests (target_transaction_id)
WHERE status = 'pending';

CREATE UNIQUE INDEX one_change_per_created_transaction
ON student_point_change_requests (created_transaction_id)
WHERE created_transaction_id IS NOT NULL;

CREATE INDEX idx_student_point_change_requests_status_created
ON student_point_change_requests (status, created_at);

CREATE INDEX idx_student_point_change_requests_requested_by_user
ON student_point_change_requests (requested_by_user_id);

CREATE TRIGGER student_point_change_requests_set_updated_at
BEFORE UPDATE ON student_point_change_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS student_point_change_requests_set_updated_at
ON student_point_change_requests;
DROP TABLE IF EXISTS student_point_change_requests;
