import {
  hashAccountToken,
  isValidAccountToken,
} from "../auth/accountToken";
import { hashPassword } from "../auth/password";
import { PasswordPolicy } from "../auth/passwordPolicy";
import { pool } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ApiError } from "../errors/apiError";
import { SessionRepository } from "../repositories/session.repository";
import { UserRepository } from "../repositories/user.repository";
import { AccountEmailTaskService } from "./accountEmailTask.service";
import { AuditLogService } from "./auditLog.service";

interface PasswordResetRequestContext {
  ipAddress: string;
  userAgent: string;
}

function createInvalidTokenError(): ApiError {
  return new ApiError(
    409,
    "account_token_invalid",
    "帳號連結無效、已過期或已使用。",
  );
}

export async function requestReset(email: string): Promise<void> {
  await withTransaction(async (client) => {
    const user = await UserRepository.findByEmailForUpdate(client, email);

    if (!user?.activated_at || !user.password_hash) {
      return;
    }

    await AccountEmailTaskService.createPasswordResetTask(client, {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
    });
  });
}

export async function resetPassword(
  token: string,
  password: string,
  context: PasswordResetRequestContext,
): Promise<void> {
  if (!isValidAccountToken(token)) {
    throw createInvalidTokenError();
  }

  await withTransaction(async (client) => {
    const user = await UserRepository.findByPasswordResetTokenHashForUpdate(
      client,
      hashAccountToken(token),
    );

    if (
      !user ||
      !user.password_reset_token_expires_at ||
      user.password_reset_token_expires_at.getTime() <= Date.now()
    ) {
      throw createInvalidTokenError();
    }

    PasswordPolicy.assert(password, user.email);
    const passwordHash = await hashPassword(password);
    await UserRepository.completePasswordReset(client, user.id, passwordHash);
    const revokedSessionCount = await SessionRepository.revokeUserSessions(
      client,
      user.id,
      "password_reset",
    );

    if (revokedSessionCount > 0) {
      await AuditLogService.record(client, {
        actorUserId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        action: "user.sessions_revoked",
        resourceType: "user",
        resourceId: user.id,
        metadata: {
          reason: "password_reset",
          revoked_session_count: revokedSessionCount,
        },
      });
    }

    await AuditLogService.record(client, {
      actorUserId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      action: "user.password_reset_completed",
      resourceType: "user",
      resourceId: user.id,
      metadata: { revoked_session_count: revokedSessionCount },
    });
  });
}

export const PasswordResetService = { requestReset, resetPassword };

