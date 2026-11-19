// Read model của lớp phân quyền: thiết bị GUEST được phép (JOIN bảng devices của module khác — quy tắc T2).
import pool from "../../../infrastructure/database/pool";
import { queryRows, type Queryable } from "../../../infrastructure/database/db";

/** Thiết bị GUEST được phép, chỉ tính thiết bị hiện còn thuộc đúng nhà. */
export async function listGuestDeviceIds(memberId: number, homeId: number, db: Queryable = pool): Promise<number[]> {
  const rows = await queryRows<{ device_id: number }>(
    `SELECT mda.device_id
       FROM member_device_access mda
       JOIN devices d ON d.id = mda.device_id
      WHERE mda.member_id = ? AND d.home_id = ?
      ORDER BY mda.device_id`,
    [memberId, homeId],
    db
  );
  return rows.map((row) => row.device_id);
}
