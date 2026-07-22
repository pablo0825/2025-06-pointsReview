-- Up Migration

ALTER TABLE audit_logs
DROP CONSTRAINT audit_logs_action_check;

ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_action_check
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
  'participant_rule.created',
  'participant_rule.deactivated',
  'application_instruction.created',
  'application_instruction.updated',
  'application_instruction.visibility_changed',
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
));

ALTER TABLE audit_logs
DROP CONSTRAINT audit_logs_resource_type_check;

ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_resource_type_check
CHECK (resource_type IN (
  'user',
  'advisor',
  'point_rule',
  'participant_rule',
  'application_instruction',
  'point_application',
  'application_attachment',
  'advisor_signature',
  'student_point_change_request',
  'student_point_transaction',
  'email_task',
  'maintenance_command',
  'system_job'
));

ALTER TABLE competition_point_rules
DROP CONSTRAINT competition_point_rules_points_check;

ALTER TABLE competition_point_rules
ADD CONSTRAINT competition_point_rules_points_check
CHECK (points > 0);

-- Down Migration

ALTER TABLE competition_point_rules
DROP CONSTRAINT competition_point_rules_points_check;

ALTER TABLE competition_point_rules
ADD CONSTRAINT competition_point_rules_points_check
CHECK (points >= 0);

ALTER TABLE audit_logs
DROP CONSTRAINT audit_logs_resource_type_check;

ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_resource_type_check
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
));

ALTER TABLE audit_logs
DROP CONSTRAINT audit_logs_action_check;

ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_action_check
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
));
