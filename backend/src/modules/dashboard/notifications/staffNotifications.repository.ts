// SQL thông báo nhân viên (FR-8.5): dòng có target_role = vai trò của tôi hoặc 'all', user_id IS NULL
// (loại trừ thông báo khách). Cờ is_read dùng chung cho cả nhóm.
import { queryOne, queryRows, runSql, sqlLimit, toCount } from "../../../lib/db";
import { NOTIFICATION_SELECT_SQL } from "../../notifications/notification.service";
import type { NotificationRow } from "../../notifications/notification.types";

export async function listStaffNotificationRows(role: string, limit: number): Promise<NotificationRow[]> {
  return queryRows<NotificationRow>(
    `${NOTIFICATION_SELECT_SQL}
      WHERE n.user_id IS NULL AND n.target_role IN (?, 'all')
      ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
    [role, sqlLimit(limit)]
  );
}

export async function countUnreadStaff(role: string): Promise<number> {
  const row = await queryOne<{ total: unknown }>(
    "SELECT COUNT(*) AS total FROM notifications WHERE user_id IS NULL AND target_role IN (?, 'all') AND is_read = 0",
    [role]
  );
  return toCount(row?.total);
}

export async function staffNotificationExists(id: number, role: string): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    "SELECT id FROM notifications WHERE id = ? AND user_id IS NULL AND target_role IN (?, 'all')",
    [id, role]
  );
  return row !== null;
}

export async function markStaffRead(id: number): Promise<void> {
  await runSql("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
}

export async function markAllStaffRead(role: string): Promise<void> {
  await runSql("UPDATE notifications SET is_read = 1 WHERE user_id IS NULL AND target_role IN (?, 'all') AND is_read = 0", [role]);
}
