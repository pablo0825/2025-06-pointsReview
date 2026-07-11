-- Up Migration

CREATE TABLE email_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key VARCHAR(160) NOT NULL,
  application_id BIGINT,
  recipient_email VARCHAR(320) NOT NULL,
  template_name VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT email_tasks_status_check
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),

  CONSTRAINT email_tasks_recipient_email_normalized_check
    CHECK (recipient_email = LOWER(BTRIM(recipient_email))),

  CONSTRAINT email_tasks_attempt_count_check
    CHECK (attempt_count >= 0),

  CONSTRAINT email_tasks_max_attempts_check
    CHECK (max_attempts > 0),

  CONSTRAINT email_tasks_attempt_count_max_check
    CHECK (attempt_count <= max_attempts),

  CONSTRAINT email_tasks_sent_at_check
    CHECK (
      (status = 'sent' AND sent_at IS NOT NULL)
      OR
      (status <> 'sent')
    ),

  CONSTRAINT email_tasks_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT email_tasks_event_key_unique
    UNIQUE (event_key)
);

CREATE INDEX idx_email_tasks_pending_scheduled
ON email_tasks (scheduled_at)
WHERE status = 'pending';

CREATE INDEX idx_email_tasks_application_id
ON email_tasks (application_id)
WHERE application_id IS NOT NULL;

CREATE TRIGGER email_tasks_set_updated_at
BEFORE UPDATE ON email_tasks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS email_tasks_set_updated_at ON email_tasks;
DROP TABLE IF EXISTS email_tasks;
