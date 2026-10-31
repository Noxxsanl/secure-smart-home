// Read model của nhà: HomeRow = smart_homes + 2 cột suy ra từ bảng module khác (customers chủ nhà, devices
// gateway) nên nằm ở *.read-model.ts (quy tắc T2). Hàm nhận `db` tuỳ chọn (mặc định pool) để chạy được cả bên
// trong transaction của người gọi.
import pool from "../../../infrastructure/database/pool";
import { placeholders, queryOne, queryRows, type Queryable } from "../../../infrastructure/database/db";
import type { HomeRow } from "../domain/home.types";

/**
 * SELECT chuẩn cho HomeRow (alias h = smart_homes, oc = customer chủ nhà). Nối thêm
 * `WHERE …` khi dùng: queryRows<HomeRow>(`${HOME_SELECT_SQL} WHERE h.status = ?`, [...]).
 * Chỉ dùng trong module homes (quy tắc T3: module khác không import hằng *_SQL).
 */
const HOME_SELECT_SQL = `
  SELECT h.id, h.name, h.package_code, h.address, h.expected_owner_name, h.timezone, h.status,
         h.owner_user_id, h.created_by, h.claimed_at, h.created_at, h.updated_at,
         oc.id AS owner_customer_id,
         (SELECT g.id FROM devices g WHERE g.home_id = h.id AND g.device_type = 'gateway' ORDER BY g.id LIMIT 1) AS gateway_id
    FROM smart_homes h
    LEFT JOIN customers oc ON oc.user_id = h.owner_user_id`;

export async function getHomeRow(id: number, db: Queryable = pool): Promise<HomeRow | null> {
  return queryOne<HomeRow>(`${HOME_SELECT_SQL} WHERE h.id = ?`, [id], db);
}

export async function listHomeRowsByIds(ids: readonly number[]): Promise<HomeRow[]> {
  if (ids.length === 0) return [];
  return queryRows<HomeRow>(`${HOME_SELECT_SQL} WHERE h.id IN (${placeholders(ids.length)}) ORDER BY h.id`, [...ids]);
}
