import { withTransaction } from "../db/transaction";
import { createApiErrorFromPostgresError } from "../errors/postgresError";
import { UserRepository } from "../repositories/user.repository";
import { UserAdminRepository } from "../repositories/userAdmin.repository";
import { AccountEmailTaskService } from "./accountEmailTask.service";
import { AuditLogService } from "./auditLog.service";

export type InitialAdminErrorCode =
  | "email_already_exists"
  | "resend_account_not_found"
  | "resend_account_state_conflict";

export class InitialAdminError extends Error {
  constructor(
    readonly code: InitialAdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InitialAdminError";
  }
}

interface CreateInitialAdminInput {
  email: string;
  displayName: string;
  resend: boolean;
}

export async function createInitialAdmin(
  input: CreateInitialAdminInput,
): Promise<{ userId: string; resent: boolean }> {
  return withTransaction(async (client) => {
    const existing = await UserRepository.findByEmailForUpdate(
      client,
      input.email,
    );

    if (input.resend) {
      if (!existing) {
        throw new InitialAdminError(
          "resend_account_not_found",
          "找不到可重寄啟用信的管理員帳號。",
        );
      }
      if (
        existing.role !== "admin" ||
        existing.activated_at ||
        existing.password_hash ||
        existing.is_active
      ) {
        throw new InitialAdminError(
          "resend_account_state_conflict",
          "只有尚未啟用的管理員帳號可以重寄啟用信。",
        );
      }

      await AccountEmailTaskService.createActivationTask(client, {
        id: existing.id,
        displayName: existing.display_name,
        email: existing.email,
      });
      await AuditLogService.recordMaintenance(client, {
        action: "user.activation_resent",
        resourceType: "user",
        resourceId: existing.id,
        metadata: { source: "admin_create_command" },
      });
      return { userId: existing.id, resent: true };
    }

    if (existing) {
      throw new InitialAdminError(
        "email_already_exists",
        "Email 已存在，指令不會覆蓋既有帳號。",
      );
    }

    try {
      const user = await UserAdminRepository.createInactive(client, {
        displayName: input.displayName,
        email: input.email,
        role: "admin",
      });
      await AccountEmailTaskService.createActivationTask(client, {
        id: user.id,
        displayName: user.display_name,
        email: user.email,
      });
      await AuditLogService.recordMaintenance(client, {
        action: "maintenance.admin_created",
        resourceType: "maintenance_command",
        resourceId: null,
        metadata: { created_user_id: Number(user.id) },
      });
      return { userId: user.id, resent: false };
    } catch (error) {
      const apiError = createApiErrorFromPostgresError(error);
      if (apiError?.code === "email_already_exists") {
        throw new InitialAdminError(
          "email_already_exists",
          "Email 已存在，指令不會覆蓋既有帳號。",
        );
      }
      throw error;
    }
  });
}

export const InitialAdminService = { createInitialAdmin };
