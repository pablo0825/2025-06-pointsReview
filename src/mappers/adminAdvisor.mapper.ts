import type { AdminAdvisorRow } from "../repositories/advisorAdmin.repository";

export interface AdminAdvisorResponse {
  id: number;
  userId: number;
  employeeNumber: string;
  name: string;
  titleCode: number;
  department: string;
  isActive: boolean;
  isDirector: boolean;
  account: {
    email: string;
    isActive: boolean;
    activatedAt: string | null;
  };
}

export function toAdminAdvisorResponse(
  advisor: AdminAdvisorRow,
): AdminAdvisorResponse {
  return {
    id: Number(advisor.id),
    userId: Number(advisor.user_id),
    employeeNumber: advisor.employee_number,
    name: advisor.name,
    titleCode: advisor.title_code,
    department: advisor.department,
    isActive: advisor.is_active,
    isDirector: advisor.is_director,
    account: {
      email: advisor.account_email,
      isActive: advisor.account_is_active,
      activatedAt: advisor.account_activated_at?.toISOString() ?? null,
    },
  };
}
