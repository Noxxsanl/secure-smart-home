// SQL của nhóm nhà/phòng phía khách trên bảng của module: thành viên hiệu lực của tôi, cập nhật tên nhà/phòng.
// Bộ đếm có JOIN bảng module khác: customer-homes.read-model.ts.
import { queryRows, runSql, type Queryable, type SqlParam } from "../../../infrastructure/database/db";
import type { MemberRole } from "../../../shared/types/domain";

export interface MembershipRow {
  member_id: number;
  home_id: number;
  member_role: MemberRole;
  expires_at: Date | null;
}

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
