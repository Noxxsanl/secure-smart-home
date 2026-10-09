// SQL của nhóm nhà/phòng phía khách: danh sách nhà của tôi + bộ đếm, số liệu overview, cập nhật tên.
import { placeholders, queryOne, queryRows, runSql, toCount, type Queryable, type SqlParam } from "../../../lib/db";
import { ONLINE_WINDOW_SECONDS } from "../../../lib/time";
import type { MemberRole } from "../../../types/domain";
import { HOME_SELECT_SQL } from "../../homes/homes.repository";
import type { HomeRow } from "../../homes/homes.types";

export interface MembershipRow {
  member_id: number;
  home_id: number;
  member_role: MemberRole;
  expires_at: Date | null;
}

const ONLINE_SQL = `(d.last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, d.last_seen, NOW()) < ${ONLINE_WINDOW_SECONDS})`;

/** Các nhà mà user là thành viên hiệu lực (GUEST hết hạn không tính). */
export async function listMemberships(userId: number, homeId?: number): Promise<MembershipRow[]> {
  const params: SqlParam[] = [userId];
  let filter = "";
  if (homeId !== undefined) {
    filter = "AND m.home_id = ?";
    params.push(homeId);
  }
  return queryRows<MembershipRow>(
    `SELECT m.id AS member_id, m.home_id, m.member_role, m.expires_at
       FROM smart_home_members m
      WHERE m.user_id = ? AND (m.expires_at IS NULL OR m.expires_at > NOW()) ${filter}
      ORDER BY m.home_id`,
    params
  );
}

export async function listHomeRowsByIds(ids: readonly number[]): Promise<HomeRow[]> {
  if (ids.length === 0) return [];
  return queryRows<HomeRow>(`${HOME_SELECT_SQL} WHERE h.id IN (${placeholders(ids.length)}) ORDER BY h.id`, [...ids]);
}

export interface DeviceCounts {
  device_count: number;
  online_count: number;
}

/** Số thiết bị (không tính gateway) theo nhà — dùng cho OWNER/CONTROLLER/VIEWER. */
export async function countDevicesByHome(homeIds: readonly number[]): Promise<Map<number, DeviceCounts>> {
  const result = new Map<number, DeviceCounts>();
  if (homeIds.length === 0) return result;
  const rows = await queryRows<{ home_id: number; device_count: unknown; online_count: unknown }>(
    `SELECT d.home_id, COUNT(*) AS device_count, SUM(${ONLINE_SQL}) AS online_count
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
    `SELECT mda.member_id, COUNT(*) AS device_count, SUM(${ONLINE_SQL}) AS online_count
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
    `SELECT COUNT(*) AS unread, SUM(severity IN ('warning', 'critical')) AS alerts
       FROM notifications
      WHERE user_id = ? AND target_role = 'user' AND home_id = ? AND is_read = 0`,
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

export async function updateHomeFields(
  db: Queryable,
  homeId: number,
  patch: { name?: string; address?: string | null }
): Promise<void> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(patch.name);
  }
  if (patch.address !== undefined) {
    sets.push("address = ?");
    params.push(patch.address);
  }
  if (sets.length === 0) return;
  await runSql(`UPDATE smart_homes SET ${sets.join(", ")} WHERE id = ?`, [...params, homeId], db);
}

export async function updateRoomName(roomId: number, name: string): Promise<void> {
  await runSql("UPDATE rooms SET name = ? WHERE id = ?", [name, roomId]);
}
