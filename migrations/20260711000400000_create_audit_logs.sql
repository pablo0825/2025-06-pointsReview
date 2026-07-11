-- Up Migration

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type VARCHAR(20) NOT NULL,
  actor_user_id BIGINT,
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id BIGINT,
  resource_public_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT audit_logs_actor_type_check
    CHECK (actor_type IN ('user', 'system', 'maintenance')),

  CONSTRAINT audit_logs_actor_user_pair_check
    CHECK (
      (actor_type = 'user' AND actor_user_id IS NOT NULL)
      OR
      (actor_type IN ('system', 'maintenance') AND actor_user_id IS NULL)
    ),

  CONSTRAINT audit_logs_request_source_pair_check
    CHECK (
      (ip_address IS NULL AND user_agent IS NULL)
      OR
      (ip_address IS NOT NULL AND user_agent IS NOT NULL)
    ),

  CONSTRAINT audit_logs_action_check
    CHECK (action IN (
      'user.created',
      'user.updated',
      'user.activated',
      'user.deactivated',
      'user.activation_resent',
      'user.password_reset_sent',
      'user.password_reset_completed',
      'user.sessions_revoked',
      'admin.transferred',
      'admin.recovered',
      'advisor.created',
      'advisor.updated',
      'advisor.activated',
      'advisor.deactivated',
      'advisor.director_assigned',
      'point_rule.created',
      'point_rule.deactivated',
      'application_attachment.viewed',
      'advisor_signature.viewed',
      'point_change_request.created',
      'point_change_request.approved',
      'point_change_request.rejected',
      'email_task.retry_requested',
      'maintenance.admin_created',
      'maintenance.admin_recovered',
      'system.expired_applications_processed',
      'system.email_task_failed_permanently'
    )),

  CONSTRAINT audit_logs_resource_type_check
    CHECK (resource_type IN (
      'user',
      'advisor',
      'point_rule',
      'point_application',
      'application_attachment',
      'advisor_signature',
      'student_point_change_request',
      'student_point_transaction',
      'email_task',
      'maintenance_command',
      'system_job'
    )),

  CONSTRAINT audit_logs_actor_user_fk
    FOREIGN KEY (actor_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);

CREATE INDEX idx_audit_logs_created
ON audit_logs (created_at DESC, id DESC);

CREATE INDEX idx_audit_logs_actor_created
ON audit_logs (actor_user_id, created_at DESC, id DESC)
WHERE actor_user_id IS NOT NULL;

CREATE INDEX idx_audit_logs_resource_created
ON audit_logs (resource_type, resource_id, created_at DESC, id DESC)
WHERE resource_id IS NOT NULL;

CREATE INDEX idx_audit_logs_action_created
ON audit_logs (action, created_at DESC, id DESC);

-- Down Migration

DROP TABLE IF EXISTS audit_logs;
