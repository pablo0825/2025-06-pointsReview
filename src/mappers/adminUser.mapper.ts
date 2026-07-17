import type { AdminUserRow } from "../repositories/userAdmin.repository";

export interface AdminUserResponse {
  id: number;
  displayName: string;
  email: string;
  role: AdminUserRow["role"];
  isActive: boolean;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toAdminUserResponse(user: AdminUserRow): AdminUserResponse {
  return {
    id: Number(user.id),
    displayName: user.display_name,
    email: user.email,
    role: user.role,
    isActive: user.is_active,
    activatedAt: user.activated_at?.toISOString() ?? null,
    createdAt: user.created_at.toISOString(),
    updatedAt: user.updated_at.toISOString(),
  };
}

export function toAdminUserListItem(
  user: AdminUserRow,
): Omit<AdminUserResponse, "updatedAt"> {
  const { updatedAt: _updatedAt, ...item } = toAdminUserResponse(user);
  return item;
}
