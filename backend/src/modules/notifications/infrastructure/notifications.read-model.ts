// Truy vấn chỉ-đọc của thông báo: notifications JOIN smart_homes để có tên nhà (home_name) trong DTO.
import { queryOne, queryRows, sqlLimit, type SqlParam } from "../../../infrastructure/database/db";
import type { NotificationRow } from "../domain/notification.types";

/**
 * SELECT chuẩn cho NotificationRow (n = notifications, h = nhà). Nối `WHERE …` khi dùng, ví dụ
 * `${NOTIFICATION_SELECT_SQL} WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ?`.
 */
const NOTIFICATION_SELECT_SQL = `
  SELECT n.id, n.title, n.message, n.type, n.severity, n.target_role, n.user_id, n.home_id,
         h.name AS home_name, n.related_device_id, n.actor_id, n.actor_username, n.actor_role,
         n.is_read, n.created_at
    FROM notifications n
    LEFT JOIN smart_homes h ON h.id = n.home_id`;

/** Tên nhà để gắn vào thông báo khách; null khi thông báo không thuộc nhà nào hoặc nhà không còn. */
export async function findHomeName(homeId: number | null): Promise<string | null> {
  if (homeId === null) return null;
  const row = await queryOne<{ name: string }>("SELECT name FROM smart_homes WHERE id = ?", [homeId]);
  return row?.name ?? null;
}

/** Thông báo của khách: chỉ dòng target_role='user' và user_id = người gọi. */
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

/** Thông báo nhân viên (FR-8.5): target_role = vai trò của tôi hoặc 'all', user_id IS NULL (loại trừ thông báo khách). */
export async function listStaffNotificationRows(role: string, limit: number): Promise<NotificationRow[]> {
  return queryRows<NotificationRow>(
    `${NOTIFICATION_SELECT_SQL}
      WHERE n.user_id IS NULL AND n.target_role IN (?, 'all')
      ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
    [role, sqlLimit(limit)]
  );
}
