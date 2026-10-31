// Danh sách thông báo của khách + số chưa đọc (FR-8.2, 8.4): không có nghiệp vụ ngoài lọc theo chủ sở hữu.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { CustomerNotification } from "../../domain/notification.types";
import { toCustomerNotification } from "../../domain/notification.mapper";
import { countUnread } from "../../infrastructure/customer-notifications.repository";
import { listForUser } from "../../infrastructure/notifications.read-model";

export async function listNotifications(
  auth: AuthContext,
  homeId: number | undefined,
  limit: number
): Promise<{ notifications: CustomerNotification[]; unread_count: number }> {
  const [rows, unread] = await Promise.all([listForUser(auth.userId, homeId, limit), countUnread(auth.userId, homeId)]);
  return { notifications: rows.map(toCustomerNotification), unread_count: unread };
}
