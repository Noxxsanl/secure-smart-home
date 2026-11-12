// SQL ghi/đọc thuần trên bảng rooms + INSERT nhà/phòng dùng bởi provisioning (createKitHome; INSERT thiết bị ở
// module devices). Đọc HomeRow nằm ở home.read-model.ts, RoomSummary ở room.read-model.ts (có JOIN module khác).
// Hàm nhận `db` tuỳ chọn (mặc định pool) để chạy được cả bên trong transaction của người gọi.
import pool from "../../../infrastructure/database/pool";
import { queryOne, runSql, type Queryable } from "../../../infrastructure/database/db";
import type { HomeStatus, PackageCode } from "../../../shared/types/domain";
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

// ── Đăng ký gateway thật cho khách (features/register-gateway) ─────────────

const CUSTOMER_HOMES_LOCK_NAMESPACE = 0x5348; // "SH"

/**
 * Khoá theo khách (advisory lock trong transaction, tự nhả khi commit/rollback): hai lượt đăng ký song song cho cùng
 * khách không cùng tạo hai nhà trùng tên. Khoá 2 số nguyên: (namespace của tính năng, users.id).
 */
export async function lockCustomerHomes(db: Queryable, ownerUserId: number): Promise<void> {
  await runSql("SELECT pg_advisory_xact_lock(?::int, ?::int)", [CUSTOMER_HOMES_LOCK_NAMESPACE, ownerUserId], db);
}

/** Nhà cùng tên mà khách đang làm chủ (dùng lại khi đăng ký thêm/lại thiết bị). */
export async function findOwnedHomeByName(
  db: Queryable,
  ownerUserId: number,
  name: string
): Promise<{ id: number; name: string; status: HomeStatus } | null> {
  return queryOne<{ id: number; name: string; status: HomeStatus }>(
    "SELECT id, name, status FROM smart_homes WHERE owner_user_id = ? AND name = ? ORDER BY id LIMIT 1",
    [ownerUserId, name],
    db
  );
}

/**
 * Nhà mới đã có chủ ngay (status 'active', claimed_at NOW) — cùng trạng thái cuối với claim; người gọi thêm dòng
 * OWNER vào smart_home_members trong cùng transaction. package_code là cột bắt buộc: phần cứng demo dùng KIT_B.
 */
export async function insertOwnedHome(
  db: Queryable,
  input: { name: string; ownerUserId: number; createdBy: number }
): Promise<number> {
  const result = await runSql(
    `INSERT INTO smart_homes (name, package_code, status, owner_user_id, created_by, claimed_at)
     VALUES (?, 'KIT_B', 'active', ?, ?, NOW())
     RETURNING id`,
    [input.name, input.ownerUserId, input.createdBy],
    db
  );
  return result.insertId;
}

export async function findRoomByName(db: Queryable, homeId: number, name: string): Promise<number | null> {
  const row = await queryOne<{ id: number }>(
    "SELECT id FROM rooms WHERE home_id = ? AND LOWER(name) = LOWER(?) ORDER BY id LIMIT 1",
    [homeId, name],
    db
  );
  return row?.id ?? null;
}

export async function nextRoomSortOrder(db: Queryable, homeId: number): Promise<number> {
  const row = await queryOne<{ next: number }>(
    "SELECT COALESCE(MAX(sort_order) + 1, 0)::int AS next FROM rooms WHERE home_id = ?",
    [homeId],
    db
  );
  return row?.next ?? 0;
}
