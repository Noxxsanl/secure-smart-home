// SQL tài khoản nhân viên. CHỈ chạm hàng role admin/operator — role=user (khách) không bao giờ xuất hiện.
import { queryOne, queryRows, runSql, toIso, toIsoRequired, type SqlParam } from "../../../lib/db";
import type { StaffAccount } from "../dashboard.types";

interface StaffRow {
  id: number;
  username: string | null;
  role: "admin" | "operator";
  status: "active" | "locked";
  created_at: Date;
  last_login: Date | null;
}

const STAFF_SELECT_SQL = "SELECT id, username, role, status, created_at, last_login FROM users WHERE role IN ('admin', 'operator')";

function toStaff(row: StaffRow): StaffAccount {
  return {
    id: row.id,
    username: row.username ?? "",
    role: row.role,
    status: row.status,
    created_at: toIsoRequired(row.created_at),
    last_login: toIso(row.last_login),
  };
}

export async function listStaff(): Promise<StaffAccount[]> {
  const rows = await queryRows<StaffRow>(`${STAFF_SELECT_SQL} ORDER BY id`);
  return rows.map(toStaff);
}

export async function getStaff(id: number): Promise<StaffAccount | null> {
  const row = await queryOne<StaffRow>(`${STAFF_SELECT_SQL} AND id = ?`, [id]);
  return row ? toStaff(row) : null;
}

export async function staffUsernameExists(username: string): Promise<boolean> {
  const row = await queryOne<{ id: number }>("SELECT id FROM users WHERE username = ?", [username]);
  return row !== null;
}

export async function insertStaff(input: { username: string; passwordHash: string; role: "operator" }): Promise<number> {
  const result = await runSql("INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, 'active')", [
    input.username,
    input.passwordHash,
    input.role,
  ]);
  return result.insertId;
}

export async function updateStaff(id: number, patch: { status?: "active" | "locked"; passwordHash?: string }): Promise<void> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (patch.passwordHash !== undefined) {
    sets.push("password_hash = ?");
    params.push(patch.passwordHash);
  }
  if (sets.length === 0) return;
  // Đặt lại mật khẩu hoặc khoá → thu hồi mọi cookie đang chạy của nhân viên đó (JWT stateless, claim `tv`)
  if (patch.passwordHash !== undefined || patch.status === "locked") sets.push("token_version = token_version + 1");
  // role IN (...) lặp lại ở UPDATE: không bao giờ sửa nhầm hàng khách dù id bị truyền sai
  await runSql(`UPDATE users SET ${sets.join(", ")} WHERE id = ? AND role IN ('admin', 'operator')`, [...params, id]);
}

export async function deleteStaff(id: number): Promise<void> {
  await runSql("DELETE FROM users WHERE id = ? AND role = 'operator'", [id]);
}
