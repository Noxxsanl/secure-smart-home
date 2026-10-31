// Read model của nhóm nhà phía khách: bộ đếm thiết bị theo nhà/GUEST, thông báo chưa đọc, gợi ý đang chờ.
// Đọc bảng devices / notifications / recommendation_history của module khác (quy tắc T2).
import { placeholders, queryOne, queryRows, toCount } from "../../../infrastructure/database/db";
import { ONLINE_WINDOW_SECONDS } from "../../../shared/time";

const ONLINE_SQL = `(d.last_seen IS NOT NULL AND d.last_seen > NOW() - make_interval(secs => ${ONLINE_WINDOW_SECONDS}))`;

export interface DeviceCounts {
  device_count: number;
  online_count: number;
}

/** Số thiết bị (không tính gateway) theo nhà — dùng cho OWNER/CONTROLLER/VIEWER. */
export async function countDevicesByHome(homeIds: readonly number[]): Promise<Map<number, DeviceCounts>> {
  const result = new Map<number, DeviceCounts>();
  if (homeIds.length === 0) return result;
  const rows = await queryRows<{ home_id: number; device_count: unknown; online_count: unknown }>(
    `SELECT d.home_id, COUNT(*) AS device_count, COUNT(*) FILTER (WHERE ${ONLINE_SQL}) AS online_count
       FROM devices d
      WHERE d.home_id IN (${placeholders(homeIds.length)}) AND d.device_type <> 'gateway'
      GROUP BY d.home_id`,
    [...homeIds]
  );
  for (const row of rows) {
    result.set(row.home_id, { device_count: toCount(row.device_count), online_count: toCount(row.online_count) });
  }
  return result;
}

/** Số thiết bị GUEST được phép theo member_id (chỉ thiết bị còn thuộc đúng nhà). */
export async function countGuestDevices(memberIds: readonly number[]): Promise<Map<number, DeviceCounts>> {
  const result = new Map<number, DeviceCounts>();
  if (memberIds.length === 0) return result;
  const rows = await queryRows<{ member_id: number; device_count: unknown; online_count: unknown }>(
    `SELECT mda.member_id, COUNT(*) AS device_count, COUNT(*) FILTER (WHERE ${ONLINE_SQL}) AS online_count
       FROM member_device_access mda
       JOIN smart_home_members m ON m.id = mda.member_id
       JOIN devices d ON d.id = mda.device_id AND d.home_id = m.home_id
      WHERE mda.member_id IN (${placeholders(memberIds.length)})
      GROUP BY mda.member_id`,
    [...memberIds]
  );
  for (const row of rows) {
    result.set(row.member_id, { device_count: toCount(row.device_count), online_count: toCount(row.online_count) });
  }
  return result;
}

/** Thông báo chưa đọc của user trong nhà: tổng và số warning/critical. */
export async function countUnreadNotifications(userId: number, homeId: number): Promise<{ unread: number; alerts: number }> {
  const row = await queryOne<{ unread: unknown; alerts: unknown }>(
    `SELECT COUNT(*) AS unread, COUNT(*) FILTER (WHERE severity IN ('warning', 'critical')) AS alerts
       FROM notifications
      WHERE user_id = ? AND target_role = 'user' AND home_id = ? AND is_read = FALSE`,
    [userId, homeId]
  );
  return { unread: toCount(row?.unread), alerts: toCount(row?.alerts) };
}

export async function countPendingSuggestions(homeId: number): Promise<number> {
  const row = await queryOne<{ total: unknown }>(
    "SELECT COUNT(*) AS total FROM recommendation_history WHERE home_id = ? AND status = 'pending'",
    [homeId]
  );
  return toCount(row?.total);
}
