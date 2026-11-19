// Dựng lại AuthContext của một KHÁCH HÀNG từ user_id — cho tiến trình nền KHÔNG có request (vd lịch hẹn giờ cần kiểm
// "người tạo lịch còn quyền điều khiển thiết bị không" đúng như lệnh bấm tay, qua requireDeviceAccess).
// Không có token nên không kiểm token_version; chặn tài khoản không còn dùng được: không tồn tại, bị khoá, không phải khách.
import type { AuthChannel, AuthContext } from "../../../core/auth/auth-context";
import { findAuthUserById } from "../infrastructure/auth.repository";
import { toAuthContext } from "./auth-user.mapper";

/** AuthContext của khách `userId` ở kênh `channel`; null nếu tài khoản đã xoá / bị khoá / là nhân viên. */
export async function loadCustomerAuthContext(userId: number, channel: AuthChannel): Promise<AuthContext | null> {
  const user = await findAuthUserById(userId);
  if (!user || user.status === "locked" || user.role !== "user") return null;
  return toAuthContext(user, channel);
}
