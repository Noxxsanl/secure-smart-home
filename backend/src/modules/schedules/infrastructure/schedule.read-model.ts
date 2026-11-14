// Đọc scheduled_actions kèm nhà (múi giờ), thiết bị, phòng, người tạo — JOIN bảng module khác nên nằm ở read-model (T2).
import { queryOne, queryRows, sqlLimit, type SqlParam } from "../../../infrastructure/database/db";
import type { ScheduleRow, ScheduleScope } from "../domain/schedule.types";

// Tên người tạo: hồ sơ khách (customers.full_name) ưu tiên, rồi users.full_name — như cách module homes hiển thị
// thành viên. NULL khi tài khoản đã xoá. Thiết bị/phòng LEFT JOIN vì lịch sống sau khi thiết bị bị xoá.
const SCHEDULE_SELECT_SQL = `
  SELECT a.id, a.home_id, h.timezone, a.device_id, d.device_name, d.appliance, r.name AS room_name,
         a.action, a.run_at, a.status, a.origin, a.channel,
         a.created_by_user_id, COALESCE(c.full_name, u.full_name) AS created_by_name,
         a.error_code, a.executed_at, a.cancelled_at, a.created_at
    FROM scheduled_actions a
    JOIN smart_homes h ON h.id = a.home_id
    LEFT JOIN devices d ON d.id = a.device_id
    LEFT JOIN rooms r ON r.id = d.room_id
    LEFT JOIN users u ON u.id = a.created_by_user_id
    LEFT JOIN customers c ON c.user_id = a.created_by_user_id`;

export async function getScheduleRow(id: number): Promise<ScheduleRow | null> {
  return queryOne<ScheduleRow>(`${SCHEDULE_SELECT_SQL} WHERE a.id = ?`, [id]);
}

/**
 * Danh sách lịch của nhà. `upcoming` = scheduled/running, sớm nhất trước; `history` = đã kết thúc, mới nhất trước.
 * `onlyCreatorUserId` ≠ null → chỉ lịch do người đó tạo (GUEST).
 */
export async function listScheduleRows(
  homeId: number,
  scope: ScheduleScope,
  limit: number,
  onlyCreatorUserId: number | null
): Promise<ScheduleRow[]> {
  const params: SqlParam[] = [homeId];
  let creatorFilter = "";
  if (onlyCreatorUserId !== null) {
    creatorFilter = "AND a.created_by_user_id = ?";
    params.push(onlyCreatorUserId);
  }
  const statusFilter =
    scope === "upcoming"
      ? "a.status IN ('scheduled','running')"
      : "a.status IN ('done','skipped','failed','cancelled','missed')";
  const order =
    scope === "upcoming"
      ? "ORDER BY a.run_at ASC, a.id ASC"
      : "ORDER BY COALESCE(a.executed_at, a.cancelled_at, a.run_at) DESC, a.id DESC";
  params.push(sqlLimit(limit));
  return queryRows<ScheduleRow>(
    `${SCHEDULE_SELECT_SQL}
      WHERE a.home_id = ? AND ${statusFilter} ${creatorFilter}
      ${order}
      LIMIT ?`,
    params
  );
}
