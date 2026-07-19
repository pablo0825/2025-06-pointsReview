import { pool } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ApiError } from "../errors/apiError";
import {
  createApiErrorFromPostgresError,
  type ConstraintErrorMappings,
} from "../errors/postgresError";
import {
  AdvisorAdminRepository,
  type CreateAdvisorInput,
  type ListAdvisorsInput,
  type UpdateAdvisorInput,
} from "../repositories/advisorAdmin.repository";
import { UserAdminRepository } from "../repositories/userAdmin.repository";
import { AccountEmailTaskService } from "./accountEmailTask.service";
import { AuditLogService, type AuditActorContext } from "./auditLog.service";

const advisorConstraintMappings: ConstraintErrorMappings = {
  advisors_employee_number_unique: {
    statusCode: 409,
    code: "employee_number_already_exists",
    message: "員工編號已被使用。",
  },
};

function createAdvisorNotFoundError(): ApiError {
  return new ApiError(404, "not_found", "指導老師不存在。");
}

function mapAdvisorConstraintError(error: unknown): never {
  const apiError = createApiErrorFromPostgresError(
    error,
    advisorConstraintMappings,
  );
  throw apiError ?? error;
}

export async function listAdvisors(input: ListAdvisorsInput) {
  return AdvisorAdminRepository.list(pool, input);
}

export interface CreateAdvisorAccountInput
  extends Omit<CreateAdvisorInput, "userId"> {
  displayName: string;
  email: string;
}

export async function createAdvisor(
  input: CreateAdvisorAccountInput,
  actor: AuditActorContext,
) {
  return withTransaction(async (client) => {
    try {
      const user = await UserAdminRepository.createInactive(client, {
        displayName: input.displayName,
        email: input.email,
        role: "advisor",
      });
      const advisor = await AdvisorAdminRepository.create(client, {
        userId: user.id,
        employeeNumber: input.employeeNumber,
        name: input.name,
        titleCode: input.titleCode,
        department: input.department,
        isDirector: input.isDirector,
      });
      await AccountEmailTaskService.createActivationTask(client, {
        id: user.id,
        displayName: user.display_name,
        email: user.email,
      });
      await AuditLogService.record(client, {
        ...actor,
        action: "user.created",
        resourceType: "user",
        resourceId: user.id,
        metadata: { role: "advisor" },
      });
      await AuditLogService.record(client, {
        ...actor,
        action: "advisor.created",
        resourceType: "advisor",
        resourceId: advisor.id,
        metadata: { user_id: Number(user.id), is_director: input.isDirector },
      });
      return advisor;
    } catch (error) {
      return mapAdvisorConstraintError(error);
    }
  });
}

export async function updateAdvisor(
  advisorId: string,
  input: UpdateAdvisorInput,
  actor: AuditActorContext,
) {
  return withTransaction(async (client) => {
    const current = await AdvisorAdminRepository.findByIdForUpdate(
      client,
      advisorId,
    );

    if (!current) {
      throw createAdvisorNotFoundError();
    }

    const changedFields = [
      input.employeeNumber !== undefined &&
      input.employeeNumber !== current.employee_number
        ? "employee_number"
        : null,
      input.name !== undefined && input.name !== current.name ? "name" : null,
      input.titleCode !== undefined && input.titleCode !== current.title_code
        ? "title_code"
        : null,
      input.department !== undefined && input.department !== current.department
        ? "department"
        : null,
    ].filter((field): field is string => field !== null);

    if (changedFields.length === 0) {
      return current;
    }

    try {
      await AdvisorAdminRepository.update(client, advisorId, input);
      await AuditLogService.record(client, {
        ...actor,
        action: "advisor.updated",
        resourceType: "advisor",
        resourceId: advisorId,
        metadata: { changed_fields: changedFields },
      });

      const updated = await AdvisorAdminRepository.findById(client, advisorId);
      if (!updated) {
        throw createAdvisorNotFoundError();
      }

      return updated;
    } catch (error) {
      return mapAdvisorConstraintError(error);
    }
  });
}

export async function activateAdvisor(
  advisorId: string,
  actor: AuditActorContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const advisor = await AdvisorAdminRepository.findByIdForUpdate(
      client,
      advisorId,
    );

    if (!advisor) {
      throw createAdvisorNotFoundError();
    }

    if (advisor.is_active) {
      return;
    }

    try {
      await AdvisorAdminRepository.setActive(client, advisorId, true);
      await AuditLogService.record(client, {
        ...actor,
        action: "advisor.activated",
        resourceType: "advisor",
        resourceId: advisorId,
        metadata: {
          previous_is_active: false,
          new_is_active: true,
        },
      });
    } catch (error) {
      return mapAdvisorConstraintError(error);
    }
  });
}

export async function deactivateAdvisor(
  advisorId: string,
  reason: string | undefined,
  actor: AuditActorContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const advisor = await AdvisorAdminRepository.findByIdForUpdate(
      client,
      advisorId,
    );

    if (!advisor) {
      throw createAdvisorNotFoundError();
    }

    if (!advisor.is_active) {
      return;
    }

    if (advisor.is_director) {
      throw new ApiError(
        409,
        "active_director_required",
        "請先指定另一位啟用中的指導老師為主任。",
      );
    }

    await AdvisorAdminRepository.setActive(client, advisorId, false);
    await AuditLogService.record(client, {
      ...actor,
      action: "advisor.deactivated",
      resourceType: "advisor",
      resourceId: advisorId,
      metadata: {
        previous_is_active: true,
        new_is_active: false,
        ...(reason ? { reason } : {}),
      },
    });
  });
}

export async function assignDirector(
  advisorId: string,
  reason: string | undefined,
  actor: AuditActorContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const currentDirector =
      await AdvisorAdminRepository.findActiveDirectorForUpdate(client);

    if (currentDirector?.id === advisorId) {
      return;
    }

    const target = await AdvisorAdminRepository.findByIdForUpdate(
      client,
      advisorId,
    );

    if (!target) {
      throw createAdvisorNotFoundError();
    }

    if (!target.is_active) {
      throw new ApiError(
        409,
        "advisor_state_conflict",
        "只有啟用中的指導老師可以被指定為主任。",
      );
    }

    try {
      if (currentDirector) {
        await AdvisorAdminRepository.setDirector(
          client,
          currentDirector.id,
          false,
        );
      }

      await AdvisorAdminRepository.setDirector(client, advisorId, true);
      await AuditLogService.record(client, {
        ...actor,
        action: "advisor.director_assigned",
        resourceType: "advisor",
        resourceId: advisorId,
        metadata: {
          previous_director_advisor_id: currentDirector
            ? Number(currentDirector.id)
            : null,
          new_director_advisor_id: Number(advisorId),
          ...(reason ? { reason } : {}),
        },
      });
    } catch (error) {
      return mapAdvisorConstraintError(error);
    }
  });
}

export const AdvisorAdminService = {
  listAdvisors,
  createAdvisor,
  updateAdvisor,
  activateAdvisor,
  deactivateAdvisor,
  assignDirector,
};
