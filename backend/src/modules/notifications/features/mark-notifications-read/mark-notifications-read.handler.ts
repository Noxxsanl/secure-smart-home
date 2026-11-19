// Đánh dấu đã đọc thông báo của khách: một dòng (:id) hoặc tất cả (theo nhà tuỳ chọn).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { notFound } from "../../../../shared/errors/http-error";
import { markAllRead, markRead } from "../../infrastructure/customer-notifications.repository";

export async function markAllNotificationsRead(auth: AuthContext, homeId: number | undefined): Promise<void> {
  await markAllRead(auth.userId, homeId);
}

export async function markNotificationRead(auth: AuthContext, id: number): Promise<void> {
  // Thông báo của người khác / không tồn tại → 404 (không lộ sự tồn tại)
  const found = await markRead(auth.userId, id);
  if (!found) throw notFound("Notification not found");
}
