// SQL ghi/đếm thông báo nhân viên (FR-8.5): dòng có target_role = vai trò của tôi hoặc 'all', user_id IS NULL
// (loại trừ thông báo khách). Cờ is_read dùng chung cho cả nhóm. Truy vấn danh sách nằm ở notifications.read-model.ts.
import pool from "../../../infrastructure/database/pool";
import { queryOne, runSql, toCount } from "../../../infrastructure/database/db";
import type { Severity } from "../../../shared/types/domain";
import type { StaffTargetRole } from "../domain/notification.types";

export interface NewStaffNotificationRow {
  title: string;
  message: string;
  type: string;
  severity: Severity;
  targetRole: StaffTargetRole;
  homeId: number | null;
  relatedDeviceId: number | null;
  actorId: number | null;
  actorUsername: string | null;
  actorRole: string | null;
}

/** INSERT một dòng dùng chung theo target_role (user_id NULL), trả id. */
export async function insertStaffNotificationRow(input: NewStaffNotificationRow): Promise<number> {
  const result = await runSql(
    `INSERT INTO notifications
       (title, message, type, severity, target_role, home_id, related_device_id, actor_id, actor_username, actor_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      input.title,
      input.message,
      input.type,
      input.severity,
      input.targetRole,
      input.homeId,
      input.relatedDeviceId,
      input.actorId,
      input.actorUsername,
      input.actorRole,
    ],
    pool
  );
  return result.insertId;
}

export async function countUnreadStaff(role: string): Promise<number> {
  const row = await queryOne<{ total: unknown }>(
    "SELECT COUNT(*) AS total FROM notifications WHERE user_id IS NULL AND target_role IN (?, 'all') AND is_read = FALSE",
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
  await runSql("UPDATE notifications SET is_read = TRUE WHERE id = ?", [id]);
}

export async function markAllStaffRead(role: string): Promise<void> {
  await runSql("UPDATE notifications SET is_read = TRUE WHERE user_id IS NULL AND target_role IN (?, 'all') AND is_read = FALSE", [role]);
}
