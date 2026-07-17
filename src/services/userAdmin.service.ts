import { pool } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ApiError } from "../errors/apiError";
import { createApiErrorFromPostgresError } from "../errors/postgresError";
import { SessionRepository } from "../repositories/session.repository";
import {
  UserAdminRepository,
  type ListUsersInput,
  type UpdateUserInput,
} from "../repositories/userAdmin.repository";
import { AuditLogService, type AuditActorContext } from "./auditLog.service";

function createUserNotFoundError(): ApiError {
  return new ApiError(404, "not_found", "使用者不存在。");
}

export async function listUsers(input: ListUsersInput) {
  return UserAdminRepository.list(pool, input);
}

export async function getUserDetail(userId: string) {
  const user = await UserAdminRepository.findById(pool, userId);

  if (!user) {
    throw createUserNotFoundError();
  }

  return user;
}

export async function updateUser(
  userId: string,
  input: UpdateUserInput,
  actor: AuditActorContext,
) {
  return withTransaction(async (client) => {
    const current = await UserAdminRepository.findByIdForUpdate(client, userId);

    if (!current) {
      throw createUserNotFoundError();
    }

    const changedFields = [
      input.displayName !== undefined &&
      input.displayName !== current.display_name
        ? "display_name"
        : null,
      input.email !== undefined && input.email !== current.email
        ? "email"
        : null,
    ].filter((field): field is string => field !== null);

    if (changedFields.length === 0) {
      return current;
    }

    try {
      const updated = await UserAdminRepository.update(client, userId, input);
      await AuditLogService.record(client, {
        ...actor,
        action: "user.updated",
        resourceType: "user",
        resourceId: userId,
        metadata: { changed_fields: changedFields },
      });

      return updated;
    } catch (error) {
      const apiError = createApiErrorFromPostgresError(error);
      throw apiError ?? error;
    }
  });
}

export async function activateUser(
  userId: string,
  actor: AuditActorContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const user = await UserAdminRepository.findByIdForUpdate(client, userId);

    if (!user) {
      throw createUserNotFoundError();
    }

    if (user.is_active) {
      return;
    }

    if (!user.activated_at || !user.password_hash) {
      throw new ApiError(
        409,
        "account_state_conflict",
        "帳號尚未完成首次啟用或密碼設定。",
      );
    }

    try {
      await UserAdminRepository.setActive(client, userId, true);
      await AuditLogService.record(client, {
        ...actor,
        action: "user.activated",
        resourceType: "user",
        resourceId: userId,
        metadata: {
          previous_is_active: false,
          new_is_active: true,
        },
      });
    } catch (error) {
      const apiError = createApiErrorFromPostgresError(error);
      throw apiError ?? error;
    }
  });
}

export async function deactivateUser(
  userId: string,
  reason: string | undefined,
  actor: AuditActorContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const user = await UserAdminRepository.findByIdForUpdate(client, userId);

    if (!user) {
      throw createUserNotFoundError();
    }

    if (!user.is_active) {
      return;
    }

    if (user.role === "admin") {
      throw new ApiError(
        409,
        "active_admin_required",
        "系統必須保留一位啟用中的管理員。",
      );
    }

    await UserAdminRepository.setActive(client, userId, false);
    const revokedSessionCount = await SessionRepository.revokeUserSessions(
      client,
      userId,
      "account_deactivated",
    );

    if (revokedSessionCount > 0) {
      await AuditLogService.record(client, {
        ...actor,
        action: "user.sessions_revoked",
        resourceType: "user",
        resourceId: userId,
        metadata: {
          reason: "account_deactivated",
          revoked_session_count: revokedSessionCount,
        },
      });
    }

    await AuditLogService.record(client, {
      ...actor,
      action: "user.deactivated",
      resourceType: "user",
      resourceId: userId,
      metadata: {
        previous_is_active: true,
        new_is_active: false,
        revoked_session_count: revokedSessionCount,
        ...(reason ? { reason } : {}),
      },
    });
  });
}

export const UserAdminService = {
  listUsers,
  getUserDetail,
  updateUser,
  activateUser,
  deactivateUser,
};
