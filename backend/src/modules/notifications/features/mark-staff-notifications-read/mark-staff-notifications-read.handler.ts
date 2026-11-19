import type { AuthContext } from "../../../../core/auth/auth-context";
import { notFound } from "../../../../shared/errors/http-error";
import {
  markAllStaffRead,
  markStaffRead,
  staffNotificationExists,
} from "../../infrastructure/staff-notifications.repository";

export async function readStaffNotification(auth: AuthContext, id: number): Promise<void> {
  // Thông báo của vai trò khác / của khách → 404 (không lộ sự tồn tại)
  if (!(await staffNotificationExists(id, auth.role))) throw notFound("Notification not found");
  await markStaffRead(id);
}

export async function readAllStaffNotifications(auth: AuthContext): Promise<void> {
  await markAllStaffRead(auth.role);
}
