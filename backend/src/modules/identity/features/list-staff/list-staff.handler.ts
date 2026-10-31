// Danh sách nhân viên (FR-11.4, chỉ ADMIN).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import type { StaffAccount } from "../../domain/console-identity.types";
import { listStaff } from "../../infrastructure/staff.repository";

export async function listTeam(auth: AuthContext): Promise<StaffAccount[]> {
  requireAdmin(auth);
  return listStaff();
}
