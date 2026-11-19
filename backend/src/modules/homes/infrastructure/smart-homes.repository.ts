// SQL của Smart Homes cho console trên bảng của module: trạng thái mã kích hoạt, cập nhật nhà, activation_logs.
// Mã kích hoạt chỉ đọc TRẠNG THÁI (không bao giờ hash/bản rõ). Hàng danh sách/thành viên/timeline (JOIN module
// khác) ở smart-homes.read-model.ts.
import {
  queryOne,
  runSql,
  toIso,
  toIsoRequired,
  type Queryable,
  type SqlParam,
} from "../../../infrastructure/database/db";
import type { HomeActivationInfo, HomePatch } from "../domain/console-home.types";

/** Trạng thái mã kích hoạt mới nhất của nhà (không đọc/trả hash). */
export async function getActivationInfo(homeId: number): Promise<HomeActivationInfo> {
  const row = await queryOne<{ expires_at: Date; used_at: Date | null; revoked_at: Date | null; created_at: Date }>(
    `SELECT expires_at, used_at, revoked_at, created_at FROM activation_tokens
      WHERE home_id = ? ORDER BY id DESC LIMIT 1`,
    [homeId]
  );
  if (!row) return { status: "none", expires_at: null, used_at: null, created_at: null };
  let status: HomeActivationInfo["status"] = "unused";
  if (row.used_at !== null) status = "used";
  else if (row.revoked_at !== null) status = "revoked";
  else if (row.expires_at.getTime() <= Date.now()) status = "expired";
  return {
    status,
    expires_at: toIsoRequired(row.expires_at),
    used_at: toIso(row.used_at),
    created_at: toIsoRequired(row.created_at),
  };
}

// ── Ghi ────────────────────────────────────────────────────────────────────

/** Cập nhật đúng các cột có trong patch (tên cột cố định, giá trị qua placeholder). */
export async function updateHome(id: number, patch: HomePatch): Promise<void> {
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
  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (sets.length === 0) return;
  await runSql(`UPDATE smart_homes SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
}

/** activation_logs (append-only, không FK) — Operator gán chủ nhà ghi method 'operator_assign'. */
export async function insertActivationLog(
  db: Queryable,
  input: {
    homeId: number;
    userId: number;
    method: "operator_assign";
    result: "success";
    ip: string | null;
    userAgent: string | null;
  }
): Promise<void> {
  await runSql(
    `INSERT INTO activation_logs (home_id, user_id, method, result, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.homeId, input.userId, input.method, input.result, input.ip, input.userAgent?.slice(0, 255) ?? null],
    db
  );
}
