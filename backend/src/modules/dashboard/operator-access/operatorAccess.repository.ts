// SQL của operator_home_access (FR-9.6): cấp / thu hồi / liệt kê grant của Operator.
import { queryOne, queryRows, runSql, sqlLimit, toIso, toIsoRequired, type Queryable, type SqlParam } from "../../../lib/db";
import pool from "../../../config/db";
import type { OperatorAccessGrant } from "../dashboard.types";

interface GrantRow {
  id: number;
  operator_user_id: number;
  operator_username: string | null;
  home_id: number;
  home_name: string;
  reason: string;
  granted_by: number;
  granted_by_username: string | null;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

const GRANT_SELECT_SQL = `
  SELECT a.id, a.operator_user_id, ou.username AS operator_username, a.home_id, h.name AS home_name,
         a.reason, a.granted_by, gu.username AS granted_by_username, a.created_at, a.expires_at, a.revoked_at
    FROM operator_home_access a
    JOIN users ou ON ou.id = a.operator_user_id
    JOIN smart_homes h ON h.id = a.home_id
    LEFT JOIN users gu ON gu.id = a.granted_by`;

export function toGrant(row: GrantRow): OperatorAccessGrant {
  const expiresAt = toIsoRequired(row.expires_at);
  return {
    id: row.id,
    operator_id: row.operator_user_id,
    operator_username: row.operator_username ?? "",
    home_id: row.home_id,
    home_name: row.home_name,
    reason: row.reason,
    granted_by: row.granted_by,
    granted_by_username: row.granted_by_username,
    granted_at: toIsoRequired(row.created_at),
    expires_at: expiresAt,
    revoked_at: toIso(row.revoked_at),
    active: row.revoked_at === null && row.expires_at.getTime() > Date.now(),
  };
}

export async function getGrantById(id: number, db: Queryable = pool): Promise<OperatorAccessGrant | null> {
  const row = await queryOne<GrantRow>(`${GRANT_SELECT_SQL} WHERE a.id = ?`, [id], db);
  return row ? toGrant(row) : null;
}

/** Grant mới nhất trước. `operatorId` undefined = mọi Operator (ADMIN). */
export async function listGrants(opts: { operatorId?: number; activeOnly?: boolean; limit: number }): Promise<OperatorAccessGrant[]> {
  const clauses: string[] = [];
  const params: SqlParam[] = [];
  if (opts.operatorId !== undefined) {
    clauses.push("a.operator_user_id = ?");
    params.push(opts.operatorId);
  }
  if (opts.activeOnly) clauses.push("a.revoked_at IS NULL AND a.expires_at > NOW()");
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await queryRows<GrantRow>(`${GRANT_SELECT_SQL} ${where} ORDER BY a.id DESC LIMIT ?`, [...params, sqlLimit(opts.limit)]);
  return rows.map(toGrant);
}

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
    "INSERT INTO operator_home_access (operator_user_id, home_id, reason, granted_by, expires_at) VALUES (?, ?, ?, ?, ?)",
    [input.operatorId, input.homeId, input.reason, input.grantedBy, input.expiresAt],
    db
  );
  return result.insertId;
}

/** Khoá hàng operator để các lần tự cấp song song của CÙNG operator được tuần tự hoá (kiểm hạn mức an toàn). */
export async function lockOperatorRow(operatorId: number, db: Queryable): Promise<void> {
  await queryOne<{ id: number }>("SELECT id FROM users WHERE id = ? FOR UPDATE", [operatorId], db);
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

/** Operator hợp lệ để cấp grant: role operator, tài khoản đang active. */
export async function findActiveOperator(id: number): Promise<{ id: number; username: string | null } | null> {
  return queryOne<{ id: number; username: string | null }>(
    "SELECT id, username FROM users WHERE id = ? AND role = 'operator' AND status = 'active'",
    [id]
  );
}
