import {
  hashAccountToken,
  isValidAccountToken,
} from "../auth/accountToken";
import { hashPassword } from "../auth/password";
import { PasswordPolicy } from "../auth/passwordPolicy";
import { pool } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ApiError } from "../errors/apiError";
import { createApiErrorFromPostgresError } from "../errors/postgresError";
import { UserRepository } from "../repositories/user.repository";
import { AuditLogService } from "./auditLog.service";

interface ActivationRequestContext {
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

export async function activate(
  token: string,
  password: string,
  context: ActivationRequestContext,
): Promise<void> {
  if (!isValidAccountToken(token)) {
    throw createInvalidTokenError();
  }

  const tokenHash = hashAccountToken(token);

  await withTransaction(async (client) => {
    const user = await UserRepository.findByActivationTokenHashForUpdate(
      client,
      tokenHash,
    );

    if (
      !user ||
      !user.activation_token_expires_at ||
      user.activation_token_expires_at.getTime() <= Date.now()
    ) {
      throw createInvalidTokenError();
    }

    PasswordPolicy.assert(password, user.email);
    const passwordHash = await hashPassword(password);
    let shouldActivate = user.role !== "admin";

    if (user.role === "admin") {
      await UserRepository.lockActiveAdminDecision(client);
      shouldActivate = !(await UserRepository.hasActiveAdmin(client));
    }

    try {
      await UserRepository.completeActivation(
        client,
        user.id,
        passwordHash,
        shouldActivate,
      );
      await AuditLogService.record(client, {
        actorUserId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        action: "user.activated",
        resourceType: "user",
        resourceId: user.id,
        metadata: { activated_by: "account_token" },
      });
    } catch (error) {
      const apiError = createApiErrorFromPostgresError(error);
      throw apiError ?? error;
    }
  });
}

export const AccountActivationService = { activate };

