import type { AuthContext } from "../../../../core/auth/auth-context";
import { toStaffNotification } from "../../domain/notification.mapper";
import type { StaffNotification } from "../../domain/notification.types";
import { listStaffNotificationRows } from "../../infrastructure/notifications.read-model";
import { countUnreadStaff } from "../../infrastructure/staff-notifications.repository";

export async function listStaffNotifications(
  auth: AuthContext,
  limit: number
): Promise<{ notifications: StaffNotification[]; unread_count: number }> {
  const [rows, unread] = await Promise.all([listStaffNotificationRows(auth.role, limit), countUnreadStaff(auth.role)]);
  return { notifications: rows.map(toStaffNotification), unread_count: unread };
}
