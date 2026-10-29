// SQL của claim (activation_tokens, activation_logs). activation_logs append-only, không FK.
import pool from "../../../config/db";
import { queryOne, queryRows, runSql, type Queryable } from "../../../lib/db";

export interface TokenRow {
  id: number;
  home_id: number;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
}

export async function findTokenByHash(codeHash: string): Promise<TokenRow | null> {
  return queryOne<TokenRow>(
    "SELECT id, home_id, expires_at, used_at, revoked_at FROM activation_tokens WHERE code_hash = ?",
    [codeHash]
  );
}

/**
 * Reason được tính vào giới hạn FR-3.6 (REVOKED, RATE_LIMITED… không tính). PENDING = lần thử đang xử lý:
 * được ghi TRƯỚC khi đếm nên các request song song thấy nhau và không thể cùng lọt qua giới hạn.
 */
export const COUNTED_REASONS = ["NOT_FOUND", "ALREADY_USED", "EXPIRED", "INVALID_QR", "PENDING"] as const;
const COUNTED_SQL = COUNTED_REASONS.map((reason) => `'${reason}'`).join(", "); // hằng cố định, không phải input

/** Thời điểm các lần thất bại (cũ → mới) của tài khoản trong cửa sổ `windowMs`. */
export async function listAccountFailures(userId: number, windowMs: number): Promise<Date[]> {
  const since = new Date(Date.now() - windowMs);
  const rows = await queryRows<{ created_at: Date }>(
    `SELECT created_at FROM activation_logs
      WHERE user_id = ? AND result = 'failed' AND reason IN (${COUNTED_SQL}) AND created_at >= ?
      ORDER BY created_at ASC LIMIT 200`,
    [userId, since]
  );
  return rows.map((row) => row.created_at);
}

/** Thời điểm các lần thất bại trên một mã (code_hash) trong cửa sổ. */
export async function listCodeFailures(codeHash: string, windowMs: number): Promise<Date[]> {
  const since = new Date(Date.now() - windowMs);
  const rows = await queryRows<{ created_at: Date }>(
    `SELECT created_at FROM activation_logs
      WHERE code_hash = ? AND result = 'failed' AND reason IN (${COUNTED_SQL}) AND created_at >= ?
      ORDER BY created_at ASC LIMIT 200`,
    [codeHash, since]
  );
  return rows.map((row) => row.created_at);
}

export interface ActivationLogInput {
  homeId: number | null;
  userId: number;
  tokenId: number | null;
  codeHash: string | null;
  method: "qr" | "code";
  result: "success" | "failed";
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Ghi activation_logs. `db` mặc định pool (kết nối RIÊNG, ngoài transaction) để lần thất bại không
 * bị rollback cùng giao dịch claim (FR-3.7). Lần thành công truyền `conn` để log + claim cùng commit.
 */
export async function insertActivationLog(input: ActivationLogInput, db: Queryable = pool): Promise<void> {
  await runSql(
    `INSERT INTO activation_logs
       (home_id, user_id, activation_token_id, code_hash, method, result, reason, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.homeId, input.userId, input.tokenId, input.codeHash, input.method, input.result, input.reason, input.ip, input.userAgent],
    db
  );
}

/**
 * Ghi lần thử ở trạng thái PENDING (result 'failed', reason 'PENDING') bằng kết nối pool riêng, rồi mới đếm
 * giới hạn. Trả id để cập nhật kết quả cuối bằng `finalizeActivationAttempt`.
 */
export async function insertPendingAttempt(input: {
  userId: number;
  codeHash: string | null;
  method: "qr" | "code";
  ip: string | null;
  userAgent: string | null;
}): Promise<number> {
  const result = await runSql(
    `INSERT INTO activation_logs (user_id, code_hash, method, result, reason, ip_address, user_agent)
     VALUES (?, ?, ?, 'failed', 'PENDING', ?, ?)
     RETURNING id`,
    [input.userId, input.codeHash, input.method, input.ip, input.userAgent]
  );
  return result.insertId;
}

/** Chốt kết quả cuối của lần thử (thành công: result 'success', reason null). `db` = conn khi cùng transaction claim. */
export async function finalizeActivationAttempt(
  id: number,
  input: { homeId: number | null; tokenId: number | null; result: "success" | "failed"; reason: string | null },
  db: Queryable = pool
): Promise<void> {
  await runSql(
    "UPDATE activation_logs SET home_id = ?, activation_token_id = ?, result = ?, reason = ? WHERE id = ?",
    [input.homeId, input.tokenId, input.result, input.reason, id],
    db
  );
}
