// SQL ghi của operator_home_access (FR-9.6): cấp / thu hồi grant của Operator, đếm hạn mức tự cấp.
// Liệt kê / đọc grant kèm tên (JOIN users) nằm ở operator-access.read-model.ts.
import { queryOne, queryRows, runSql, type Queryable } from "../../../infrastructure/database/db";
import pool from "../../../infrastructure/database/pool";

export async function insertGrant(
  input: {
    operatorId: number;
    homeId: number;
    reason: string;
    grantedBy: number;
    expiresAt: Date;
  },
  db: Queryable = pool
): Promise<number> {
  const result = await runSql(
    "INSERT INTO operator_home_access (operator_user_id, home_id, reason, granted_by, expires_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
    [input.operatorId, input.homeId, input.reason, input.grantedBy, input.expiresAt],
    db
  );
  return result.insertId;
}

/** Số grant operator TỰ cấp (granted_by = chính mình) trong `hours` giờ gần nhất, kể cả đã thu hồi. */
export async function countSelfServiceGrantsSince(operatorId: number, hours: number, db: Queryable = pool): Promise<number> {
  const row = await queryOne<{ total: unknown }>(
    `SELECT COUNT(*) AS total FROM operator_home_access
      WHERE operator_user_id = ? AND granted_by = operator_user_id AND created_at > ?`,
    [operatorId, new Date(Date.now() - hours * 3600 * 1000)],
    db
  );
  return Number(row?.total ?? 0);
}

/** Thu hồi nếu chưa thu hồi; trả true nếu có dòng được cập nhật. */
export async function markGrantRevoked(id: number, revokedBy: number): Promise<boolean> {
  const result = await runSql(
    "UPDATE operator_home_access SET revoked_at = NOW(), revoked_by = ? WHERE id = ? AND revoked_at IS NULL",
    [revokedBy, id]
  );
  return result.affectedRows > 0;
}

/** Nhà mà Operator đang có grant hiệu lực (chưa thu hồi, chưa hết hạn) — phạm vi xem dữ liệu khách (FR-9.6). */
export async function listActiveGrantHomeIds(operatorId: number): Promise<number[]> {
  const rows = await queryRows<{ home_id: number }>(
    `SELECT DISTINCT home_id FROM operator_home_access
      WHERE operator_user_id = ? AND revoked_at IS NULL AND expires_at > NOW()`,
    [operatorId]
  );
  return rows.map((row) => row.home_id);
}
