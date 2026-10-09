// Helper truy vấn có kiểu cho module V2 (mysql2/promise).
// Quy ước:
//   - SQL luôn dùng placeholder `?`; danh sách IN dựng bằng placeholders(n).
//   - `pool.execute` là prepared statement: tham số LIMIT/OFFSET phải truyền dạng CHUỖI
//     (sqlLimit) — MySQL ≥ 8.0.22 báo "Incorrect arguments to mysqld_stmt_execute" nếu là số.
//   - Mọi DATETIME đọc ra là Date UTC (pool timezone "+00:00"); DTO trả ISO qua toIso().
//   - TINYINT(1) đọc ra là 0/1 → toBool(); DECIMAL/SUM() đọc ra là chuỗi → toNumberOrNull().
import type { Connection, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "../config/db";

/** Pool hoặc connection đang trong transaction — mọi hàm repository nhận tham số này. */
export type Queryable = Connection;
export type SqlParam = string | number | bigint | boolean | Date | Buffer | null;

/**
 * Chạy `fn` trong một transaction (invariant 9: ghi ≥ 2 bảng phải atomically).
 * Lỗi bất kỳ (kể cả HttpError ném ra từ fn) → rollback rồi ném tiếp.
 */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // connection có thể đã hỏng — lỗi gốc mới là lỗi cần báo
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** SELECT → mảng row đã ép kiểu T (T mô tả đúng các cột SELECT). */
export async function queryRows<T>(sql: string, params: SqlParam[] = [], db: Queryable = pool): Promise<T[]> {
  const [rows] = await db.execute<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

/** SELECT lấy 1 row hoặc null. */
export async function queryOne<T>(sql: string, params: SqlParam[] = [], db: Queryable = pool): Promise<T | null> {
  const rows = await queryRows<T>(sql, params, db);
  return rows[0] ?? null;
}

/** INSERT/UPDATE/DELETE → ResultSetHeader (insertId, affectedRows). */
export async function runSql(sql: string, params: SqlParam[] = [], db: Queryable = pool): Promise<ResultSetHeader> {
  const [result] = await db.execute<ResultSetHeader>(sql, params);
  return result;
}

/** "?, ?, ?" cho mệnh đề IN. Gọi với count ≥ 1 (IN () là lỗi cú pháp). */
export function placeholders(count: number): string {
  if (!Number.isInteger(count) || count < 1) throw new Error("placeholders() needs count >= 1");
  return new Array(count).fill("?").join(", ");
}

/** Giá trị cho `LIMIT ?` / `OFFSET ?` dưới pool.execute — số nguyên không âm dạng chuỗi. */
export function sqlLimit(value: number): string {
  return String(Math.max(0, Math.trunc(value)));
}

// ── Chuyển kiểu cột → DTO ──────────────────────────────────────────────────

export function toBool(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}

export function toBoolOrNull(value: unknown): boolean | null {
  return value === null || value === undefined ? null : toBool(value);
}

/** DECIMAL/SUM/AVG (mysql2 trả chuỗi) hoặc số → number; null/không hợp lệ → null. */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/** COUNT/SUM → number (null → 0). */
export function toCount(value: unknown): number {
  return toNumberOrNull(value) ?? 0;
}

/** Date/chuỗi thời gian → ISO-8601 UTC; null → null. */
export function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Như toIso nhưng cho cột NOT NULL. */
export function toIsoRequired(value: Date | string): string {
  return toIso(value) ?? new Date(0).toISOString();
}

/** Lỗi trùng khoá unique (ER_DUP_ENTRY); `keyName` lọc theo tên index (vd "uq_users_email"). */
export function isDuplicateKeyError(err: unknown, keyName?: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code !== "ER_DUP_ENTRY") return false;
  return keyName === undefined || (typeof message === "string" && message.includes(keyName));
}
