// SQL ghi/đọc thuần trên bảng rooms + INSERT nhà/phòng dùng bởi provisioning (createKitHome; INSERT thiết bị ở
// module devices). Đọc HomeRow nằm ở home.read-model.ts, RoomSummary ở room.read-model.ts (có JOIN module khác).
// Hàm nhận `db` tuỳ chọn (mặc định pool) để chạy được cả bên trong transaction của người gọi.
import pool from "../../../infrastructure/database/pool";
import { queryOne, runSql, type Queryable } from "../../../infrastructure/database/db";
import type { PackageCode } from "../../../shared/types/domain";
import type { RoomRow } from "../domain/home.types";

export async function getRoomRow(id: number, db: Queryable = pool): Promise<RoomRow | null> {
  return queryOne<RoomRow>(
    "SELECT id, home_id, name, room_type, sort_order, created_at, updated_at FROM rooms WHERE id = ?",
    [id],
    db
  );
}

// ── INSERT cho provisioning ────────────────────────────────────────────────

export async function insertHome(
  db: Queryable,
  input: {
    name: string;
    packageCode: PackageCode;
    address: string | null;
    expectedOwnerName: string | null;
    createdBy: number;
  }
): Promise<number> {
  const result = await runSql(
    `INSERT INTO smart_homes (name, package_code, address, expected_owner_name, status, created_by)
     VALUES (?, ?, ?, ?, 'unclaimed', ?)
     RETURNING id`,
    [input.name, input.packageCode, input.address, input.expectedOwnerName, input.createdBy],
    db
  );
  return result.insertId;
}

export async function insertRoom(
  db: Queryable,
  input: { homeId: number; name: string; roomType: string; sortOrder: number }
): Promise<number> {
  const result = await runSql(
    "INSERT INTO rooms (home_id, name, room_type, sort_order) VALUES (?, ?, ?, ?) RETURNING id",
    [input.homeId, input.name, input.roomType, input.sortOrder],
    db
  );
  return result.insertId;
}
