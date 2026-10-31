// Quy tắc quản lý nhân viên (FR-11.4): không sửa/xoá chính mình hay ADMIN khác (chống tự khoá và leo thang).
// Dùng chung cho update-staff và delete-staff; feature tự nạp `target` (getStaff) rồi gọi hàm thuần này.
import type { AuthContext } from "../../../core/auth/auth-context";
import { forbidden, notFound } from "../../../shared/errors/http-error";
import type { StaffAccount } from "./console-identity.types";

/** Tài khoản nhân viên đích: 404 nếu không phải nhân viên; 403 nếu là chính mình hoặc ADMIN khác. */
export function assertManageableTarget(auth: AuthContext, target: StaffAccount | null): StaffAccount {
  if (!target) throw notFound("Staff account not found");
  if (target.id === auth.userId) throw forbidden("You cannot modify your own account here");
  if (target.role === "admin") throw forbidden("Admin accounts cannot be modified");
  return target;
}
