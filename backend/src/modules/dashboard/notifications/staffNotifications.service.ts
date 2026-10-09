import { notFound } from "../../../lib/http";
import type { AuthContext } from "../../auth/auth.types";
import { toStaffNotification } from "../../notifications/notification.service";
import type { StaffNotification } from "../../notifications/notification.types";
import {
  countUnreadStaff,
  listStaffNotificationRows,
  markAllStaffRead,
  markStaffRead,
  staffNotificationExists,
} from "./staffNotifications.repository";

export async function listStaffNotifications(
  auth: AuthContext,
  limit: number
): Promise<{ notifications: StaffNotification[]; unread_count: number }> {
  const [rows, unread] = await Promise.all([listStaffNotificationRows(auth.role, limit), countUnreadStaff(auth.role)]);
  return { notifications: rows.map(toStaffNotification), unread_count: unread };
}

export async function readStaffNotification(auth: AuthContext, id: number): Promise<void> {
  // Thông báo của vai trò khác / của khách → 404 (không lộ sự tồn tại)
  if (!(await staffNotificationExists(id, auth.role))) throw notFound("Notification not found");
  await markStaffRead(id);
}

export async function readAllStaffNotifications(auth: AuthContext): Promise<void> {
  await markAllStaffRead(auth.role);
}
