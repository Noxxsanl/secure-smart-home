// SQL ghi/đếm thông báo của khách: chỉ các dòng target_role='user' và user_id = người nhận. Truy vấn danh sách
// (JOIN tên nhà) nằm ở notifications.read-model.ts.
import { queryOne, runSql, toCount, type SqlParam } from "../../../infrastructure/database/db";
import type { Severity } from "../../../shared/types/domain";

export interface NewCustomerNotificationRow {
  title: string;
  message: string;
  type: string;
  severity: Severity;
  userId: number;
  homeId: number | null;
  relatedDeviceId: number | null;
  createdAt: Date;
}

/** INSERT một dòng cho một người nhận (target_role='user'), trả id. created_at do người gọi quyết định. */
export async function insertCustomerNotificationRow(input: NewCustomerNotificationRow): Promise<number> {
  const result = await runSql(
    `INSERT INTO notifications (title, message, type, severity, target_role, user_id, home_id, related_device_id, created_at)
     VALUES (?, ?, ?, ?, 'user', ?, ?, ?, ?)
     RETURNING id`,
    [input.title, input.message, input.type, input.severity, input.userId, input.homeId, input.relatedDeviceId, input.createdAt]
  );
  return result.insertId;
}

export async function countUnread(userId: number, homeId: number | undefined): Promise<number> {
  const params: SqlParam[] = [userId];
  let homeFilter = "";
  if (homeId !== undefined) {
    homeFilter = "AND home_id = ?";
    params.push(homeId);
  }
  const row = await queryOne<{ total: unknown }>(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND target_role = 'user' AND is_read = FALSE ${homeFilter}`,
    params
  );
  return toCount(row?.total);
}

export async function markRead(userId: number, id: number): Promise<boolean> {
  const own = await queryOne<{ id: number }>("SELECT id FROM notifications WHERE id = ? AND user_id = ? AND target_role = 'user'", [id, userId]);
  if (!own) return false;
  await runSql("UPDATE notifications SET is_read = TRUE WHERE id = ?", [id]);
  return true;
}

export async function markAllRead(userId: number, homeId: number | undefined): Promise<void> {
  const params: SqlParam[] = [userId];
  let homeFilter = "";
  if (homeId !== undefined) {
    homeFilter = "AND home_id = ?";
    params.push(homeId);
  }
  await runSql(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND target_role = 'user' AND is_read = FALSE ${homeFilter}`,
    params
  );
}
