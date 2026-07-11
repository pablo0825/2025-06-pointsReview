-- Up Migration

CREATE TABLE application_review_actions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  actor_user_id BIGINT,
  actor_type VARCHAR(20) NOT NULL,
  action_type VARCHAR(40) NOT NULL,
  reason TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_review_actions_actor_type_check
    CHECK (actor_type IN ('advisor', 'reviewer', 'applicant', 'system')),

  CONSTRAINT application_review_actions_action_type_check
    CHECK (action_type IN (
      'advisor_approved',
      'advisor_rejected',
      'revision_requested',
      'revision_extended',
      'resubmitted',
      'reviewer_approved',
      'reviewer_rejected',
      'revision_expired',
      'advisor_confirmation_expired'
    )),

  CONSTRAINT application_review_actions_actor_pair_check
    CHECK (
      (actor_type IN ('applicant', 'system') AND actor_user_id IS NULL)
      OR
      (actor_type IN ('advisor', 'reviewer') AND actor_user_id IS NOT NULL)
    ),

  CONSTRAINT application_review_actions_audit_fields_check
    CHECK (
      (actor_type = 'system' AND ip_address IS NULL AND user_agent IS NULL)
      OR
      (actor_type <> 'system' AND ip_address IS NOT NULL AND user_agent IS NOT NULL)
    ),

  CONSTRAINT application_review_actions_reason_required_check
    CHECK (
      action_type IN ('advisor_approved', 'resubmitted', 'reviewer_approved')
      OR reason IS NOT NULL
    ),

  CONSTRAINT application_review_actions_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT application_review_actions_actor_user_fk
    FOREIGN KEY (actor_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);

CREATE INDEX idx_application_review_actions_application_created
ON application_review_actions (application_id, created_at);

CREATE INDEX idx_application_review_actions_actor_created
ON application_review_actions (actor_user_id, created_at)
WHERE actor_user_id IS NOT NULL;

-- Down Migration

DROP TABLE IF EXISTS application_review_actions;
