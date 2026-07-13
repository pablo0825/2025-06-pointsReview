export type Role = "advisor" | "reviewer" | "admin";

export type Permission =
  | "advisor_applications.pending.list"
  | "advisor_applications.pending.read"
  | "advisor_applications.history.list"
  | "advisor_applications.history.read"
  | "advisor_applications.attachments.read"
  | "advisor_applications.signatures.read_own"
  | "advisor_applications.approve"
  | "advisor_applications.reject"
  | "applications.review.list"
  | "applications.review.read"
  | "applications.history.list"
  | "applications.history.read"
  | "applications.revision.request"
  | "applications.revision.extend"
  | "applications.points.adjust_before_approval"
  | "applications.approve"
  | "applications.reject"
  | "applications.attachments.read"
  | "applications.signatures.read"
  | "applications.all.list"
  | "applications.all.read"
  | "application_review_actions.read"
  | "audit_logs.read"
  | "email_tasks.read"
  | "email_tasks.retry"
  | "point_change_requests.list"
  | "point_change_requests.read"
  | "point_change_requests.create"
  | "point_change_requests.approve"
  | "point_change_requests.reject"
  | "point_rules.list"
  | "point_rules.create"
  | "point_rules.deactivate"
  | "student_point_transactions.read"
  | "users.list"
  | "users.read"
  | "users.create"
  | "users.update"
  | "users.activate"
  | "users.deactivate"
  | "users.transfer_admin"
  | "users.activation.resend"
  | "users.password_reset.send"
  | "advisors.list"
  | "advisors.create"
  | "advisors.update"
  | "advisors.activate"
  | "advisors.deactivate"
  | "advisors.assign_director";

export const rolePermissions: Record<Role, ReadonlySet<Permission>> = {
  advisor: new Set([
    "advisor_applications.pending.list",
    "advisor_applications.pending.read",
    "advisor_applications.history.list",
    "advisor_applications.history.read",
    "advisor_applications.attachments.read",
    "advisor_applications.signatures.read_own",
    "advisor_applications.approve",
    "advisor_applications.reject",
  ]),
  reviewer: new Set([
    "applications.review.list",
    "applications.review.read",
    "applications.history.list",
    "applications.history.read",
    "applications.attachments.read",
    "applications.signatures.read",
    "applications.revision.request",
    "applications.revision.extend",
    "applications.points.adjust_before_approval",
    "applications.approve",
    "applications.reject",
    "point_change_requests.list",
    "point_change_requests.create",
  ]),
  admin: new Set([
    "users.list",
    "users.read",
    "users.create",
    "users.update",
    "users.activate",
    "users.deactivate",
    "users.transfer_admin",
    "users.activation.resend",
    "users.password_reset.send",
    "advisors.list",
    "advisors.create",
    "advisors.update",
    "advisors.activate",
    "advisors.deactivate",
    "advisors.assign_director",
    "point_rules.list",
    "point_rules.create",
    "point_rules.deactivate",
    "point_change_requests.list",
    "point_change_requests.read",
    "point_change_requests.approve",
    "point_change_requests.reject",
    "applications.all.list",
    "applications.all.read",
    "applications.attachments.read",
    "applications.signatures.read",
    "application_review_actions.read",
    "audit_logs.read",
    "email_tasks.read",
    "email_tasks.retry",
    "student_point_transactions.read",
  ]),
};

export function isRole(value: unknown): value is Role {
  return value === "advisor" || value === "reviewer" || value === "admin";
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
