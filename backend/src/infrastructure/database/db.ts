// Helper truy vấn có kiểu cho module V2 (PostgreSQL, driver `pg`).
// Quy ước:
//   - SQL viết với placeholder `?` (giữ phong cách cũ); helper tự đổi sang $1..$n trước khi gửi
//     (toPgPlaceholders). Danh sách IN dựng bằng placeholders(n).
//   - Mọi TIMESTAMPTZ đọc ra là Date (session UTC, xem infrastructure/database/pool.ts); DTO trả ISO qua toIso().
//   - BOOLEAN đọc ra là true/false → toBool() vẫn chấp nhận cả 0/1 cho dữ liệu cũ; trong SQL so với
//     TRUE/FALSE, KHÔNG so với số (`is_enabled = TRUE`, không phải `= 1`).
//   - NUMERIC/AVG()/SUM() đọc ra là chuỗi → toNumberOrNull(); COUNT(*) và BIGINT đã được ép sang number.
//   - Muốn lấy id vừa chèn: viết `INSERT … RETURNING id` rồi đọc `insertId` từ runSql.
//   - Tên cột/bảng không đặt trong ngoặc kép nên PostgreSQL tự hạ về chữ thường; so sánh chuỗi
//     phân biệt hoa/thường → username/email phải so bằng `LOWER(col) = LOWER(?)`.
import type { Pool, PoolClient, QueryResultRow } from "pg";
import pool from "./pool";

/** Pool hoặc connection đang trong transaction — mọi hàm repository nhận tham số này. */
export type Queryable = Pool | PoolClient;
export type SqlParam = string | number | bigint | boolean | Date | Buffer | null;

/** Kết quả INSERT/UPDATE/DELETE: id (khi có RETURNING id), số dòng bị ảnh hưởng. */
export interface RunResult {
  /** `id` của dòng đầu tiên từ `RETURNING id`; 0 nếu câu lệnh không có RETURNING id. */
  insertId: number;
  affectedRows: number;
}

const IDENT_CHAR = /[A-Za-z0-9_\u0080-￿]/;
// Mở dollar-quote: `$$` hoặc `$tag$` (tag không bắt đầu bằng số, nên `$1` không bị nhầm).
const DOLLAR_TAG = /\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/y;

/**
 * Đổi `?` → `$1..$n`. Bỏ qua `?` nằm trong chuỗi '…' (kể cả '' thoát), E'…' (backslash thoát, vd E'it\'s ?'),
 * định danh "…", dollar-quote `$$…$$` / `$tag$…$tag$`, comment `-- …` và comment khối `/* … *\/` (kể cả lồng
 * nhau như PostgreSQL) — vì hằng chuỗi trong SQL có thể chứa dấu hỏi (vd 'Bạn có chắc?').
 * VẪN KHÔNG hỗ trợ toán tử JSONB `?`/`?|`/`?&` (sẽ bị đổi thành `$n`): viết `jsonb_exists(col, ?)`,
 * `jsonb_exists_any(...)`, `jsonb_exists_all(...)` thay thế.
 */
export function toPgPlaceholders(sql: string): string {
  let out = "";
  let index = 0;
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      // Chuỗi/định danh: chép nguyên đến dấu đóng; dấu đóng nhân đôi ('' hoặc "") là ký tự thoát.
      // E'…' (chữ E đứng riêng, không phải đuôi của định danh khác) còn coi `\` là thoát ký tự kế tiếp.
      const backslashEscapes = ch === "'" && (sql[i - 1] === "E" || sql[i - 1] === "e") && !IDENT_CHAR.test(sql[i - 2] ?? "");
      let j = i + 1;
      while (j < n) {
        if (backslashEscapes && sql[j] === "\\") {
          j += 2;
          continue;
        }
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += sql.slice(i, stop);
      i = stop;
    } else if (ch === "/" && sql[i + 1] === "*") {
      // PostgreSQL cho phép comment khối lồng nhau → đếm độ sâu thay vì dừng ở `*/` đầu tiên.
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          depth += 1;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      out += sql.slice(i, j);
      i = j;
    } else if (ch === "$" && !IDENT_CHAR.test(sql[i - 1] ?? "")) {
      // `$` nằm giữa định danh (foo$bar) không mở dollar-quote.
      DOLLAR_TAG.lastIndex = i;
      const tag = DOLLAR_TAG.exec(sql)?.[0];
      if (tag === undefined) {
        out += ch;
        i += 1;
      } else {
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        out += sql.slice(i, stop);
        i = stop;
      }
    } else if (ch === "?") {
      index += 1;
      out += `$${index}`;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/**
 * Chạy `fn` trong một transaction (invariant 9: ghi ≥ 2 bảng phải atomically).
 * Lỗi bất kỳ (kể cả HttpError ném ra từ fn) → rollback rồi ném tiếp.
 */
export async function withTransaction<T>(fn: (conn: PoolClient) => Promise<T>): Promise<T> {
  const conn = await pool.connect();
  // Pool chỉ nghe lỗi của client đang rảnh; client đã checkout không có listener 'error' nên đứt kết nối
  // giữa transaction sẽ thành uncaught exception làm sập process. Lỗi vẫn được báo cho caller qua query đang chạy.
  const onConnError = (err: Error): void => {
    console.error("[db] transaction connection error:", err.message);
  };
  conn.on("error", onConnError);
  let broken: Error | undefined;
  try {
    await conn.query("BEGIN");
    const result = await fn(conn);
    await conn.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await conn.query("ROLLBACK");
    } catch (rollbackErr) {
      // connection có thể đã hỏng — lỗi gốc mới là lỗi cần báo, nhưng client này phải bị huỷ khỏi pool
      broken = rollbackErr instanceof Error ? rollbackErr : new Error("ROLLBACK failed");
    }
    throw err;
  } finally {
    // Client hỏng: giữ listener (có thể còn sự kiện lỗi đến muộn) và release(err) để pool huỷ nó.
    if (broken === undefined) conn.off("error", onConnError);
    conn.release(broken);
  }
}

/** SELECT → mảng row đã ép kiểu T (T mô tả đúng các cột SELECT). */
export async function queryRows<T>(sql: string, params: SqlParam[] = [], db: Queryable = pool): Promise<T[]> {
  const result = await db.query<QueryResultRow>(toPgPlaceholders(sql), params);
  return result.rows as unknown as T[];
}

/** SELECT lấy 1 row hoặc null. */
export async function queryOne<T>(sql: string, params: SqlParam[] = [], db: Queryable = pool): Promise<T | null> {
  const rows = await queryRows<T>(sql, params, db);
  return rows[0] ?? null;
}

/** INSERT/UPDATE/DELETE → { insertId (cần `RETURNING id`), affectedRows }. */
export async function runSql(sql: string, params: SqlParam[] = [], db: Queryable = pool): Promise<RunResult> {
  const result = await db.query<QueryResultRow>(toPgPlaceholders(sql), params);
  const firstId = result.rows[0]?.id;
  const insertId = typeof firstId === "number" ? firstId : Number(firstId ?? 0);
  return { insertId: Number.isFinite(insertId) ? insertId : 0, affectedRows: result.rowCount ?? 0 };
}

/** "?, ?, ?" cho mệnh đề IN. Gọi với count ≥ 1 (IN () là lỗi cú pháp). */
export function placeholders(count: number): string {
  if (!Number.isInteger(count) || count < 1) throw new Error("placeholders() needs count >= 1");
  return new Array(count).fill("?").join(", ");
}

/** Giá trị cho `LIMIT ?` / `OFFSET ?` — số nguyên không âm (dạng chuỗi; PostgreSQL tự ép sang bigint). */
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

/** NUMERIC/SUM/AVG (pg trả chuỗi) hoặc số → number; null/không hợp lệ → null. */
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

/**
 * Lỗi trùng khoá unique (SQLSTATE 23505); `keyName` lọc theo tên ràng buộc/index
 * (pg đặt vào `err.constraint`, vd "uq_users_email").
 */
export function isDuplicateKeyError(err: unknown, keyName?: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, constraint } = err as { code?: unknown; constraint?: unknown };
  if (code !== "23505") return false;
  return keyName === undefined || constraint === keyName;
}

/** Vi phạm khoá ngoại (SQLSTATE 23503): tham chiếu dòng không tồn tại hoặc xoá dòng đang được tham chiếu. */
export function isForeignKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23503";
}
