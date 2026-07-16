import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  rolePermissions,
  type Permission,
  type Role,
} from "../../src/auth/permissions";
import { ApiError } from "../../src/errors/apiError";
import { requirePermission } from "../../src/middlewares/permission.middleware";

const expectedPermissions: Record<Role, Permission[]> = {
  advisor: [
    "advisor_applications.pending.list",
    "advisor_applications.pending.read",
    "advisor_applications.history.list",
    "advisor_applications.history.read",
    "advisor_applications.attachments.read",
    "advisor_applications.signatures.read_own",
    "advisor_applications.approve",
    "advisor_applications.reject",
  ],
  reviewer: [
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
  ],
  admin: [
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
    "participant_rules.list",
    "participant_rules.create",
    "participant_rules.deactivate",
    "application_instructions.list",
    "application_instructions.create",
    "application_instructions.update",
    "application_instructions.visibility",
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
  ],
};

function createRequest(role?: Role): Request {
  return {
    user: role
      ? {
          id: "1",
          email: `${role}@example.com`,
          role,
        }
      : undefined,
  } as Request;
}

describe("role permission mapping", () => {
  it.each(Object.entries(expectedPermissions) as [Role, Permission[]][])(
    "matches the documented %s permissions exactly",
    (role, permissions) => {
      expect([...rolePermissions[role]].sort()).toEqual([...permissions].sort());
    },
  );
});

describe("permission middleware", () => {
  it("allows a role that has the required permission", () => {
    const next = vi.fn<NextFunction>();

    requirePermission("users.list")(
      createRequest("admin"),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it.each([undefined, "advisor", "reviewer"] as const)(
    "returns forbidden when role %s lacks the permission",
    (role) => {
      const next = vi.fn<NextFunction>();

      requirePermission("users.list")(
        createRequest(role),
        {} as Response,
        next,
      );

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ statusCode: 403, code: "forbidden" });
    },
  );
});
