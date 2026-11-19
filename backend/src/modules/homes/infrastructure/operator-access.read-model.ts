// Read model của operator_home_access (FR-9.6): grant kèm tên operator / người cấp / nhà (JOIN users +
// smart_homes), tra Operator hợp lệ. Đọc bảng users của module identity nên nằm ở *.read-model.ts (quy tắc T2);
// phần ghi (cấp / thu hồi / đếm hạn mức) ở operator-access.repository.ts.
import {
  queryOne,
  queryRows,
  sqlLimit,
  toIso,
  toIsoRequired,
  type Queryable,
  type SqlParam,
} from "../../../infrastructure/database/db";
import pool from "../../../infrastructure/database/pool";
import type { OperatorAccessGrant } from "../domain/console-home.types";

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

/** Khoá hàng operator để các lần tự cấp song song của CÙNG operator được tuần tự hoá (kiểm hạn mức an toàn). */
export async function lockOperatorRow(operatorId: number, db: Queryable): Promise<void> {
  await queryOne<{ id: number }>("SELECT id FROM users WHERE id = ? FOR UPDATE", [operatorId], db);
}

/** Operator hợp lệ để cấp grant: role operator, tài khoản đang active. */
export async function findActiveOperator(id: number): Promise<{ id: number; username: string | null } | null> {
  return queryOne<{ id: number; username: string | null }>(
    "SELECT id, username FROM users WHERE id = ? AND role = 'operator' AND status = 'active'",
    [id]
  );
}
