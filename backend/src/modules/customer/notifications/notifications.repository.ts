// SQL thông báo của khách: chỉ các dòng target_role='user' và user_id = người gọi.
import { queryOne, queryRows, runSql, sqlLimit, toCount, type SqlParam } from "../../../lib/db";
import { NOTIFICATION_SELECT_SQL } from "../../notifications/notification.service";
import type { NotificationRow } from "../../notifications/notification.types";

export async function listForUser(userId: number, homeId: number | undefined, limit: number): Promise<NotificationRow[]> {
  const params: SqlParam[] = [userId];
  let homeFilter = "";
  if (homeId !== undefined) {
    homeFilter = "AND n.home_id = ?";
    params.push(homeId);
  }
  params.push(sqlLimit(limit));
  return queryRows<NotificationRow>(
    `${NOTIFICATION_SELECT_SQL}
      WHERE n.user_id = ? AND n.target_role = 'user' ${homeFilter}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ?`,
    params
  );
}

export async function countUnread(userId: number, homeId: number | undefined): Promise<number> {
  const params: SqlParam[] = [userId];
  let homeFilter = "";
  if (homeId !== undefined) {
    homeFilter = "AND home_id = ?";
    params.push(homeId);
  }
  const row = await queryOne<{ total: unknown }>(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND target_role = 'user' AND is_read = 0 ${homeFilter}`,
    params
  );
  return toCount(row?.total);
}

export async function markRead(userId: number, id: number): Promise<boolean> {
  const own = await queryOne<{ id: number }>("SELECT id FROM notifications WHERE id = ? AND user_id = ? AND target_role = 'user'", [id, userId]);
  if (!own) return false;
  await runSql("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
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
    `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND target_role = 'user' AND is_read = 0 ${homeFilter}`,
    params
  );
}
