import type { PoolClient } from "pg";
import pool from "./pool";

// Hệ thống migration tuần tự đơn giản cho PostgreSQL.
// BASELINE = infra/postgres/migrations/001_schema.sql (schema V2 đầy đủ, nạp lúc khởi tạo volume Docker hoặc
// chạy tay theo docs/guides/CHAY_LOCAL.md). Mảng `migrations` chỉ chứa thay đổi SAU baseline, nên hiện RỖNG:
// 30 entry MySQL cũ đã được gộp vào 001_schema.sql (chưa có DB PostgreSQL nào cần nâng cấp).
//
// Mỗi entry chỉ được áp dụng đúng một lần, theo dõi qua bảng _migrations.
// QUY TẮC: chỉ THÊM vào cuối mảng, mỗi entry đúng 1 câu SQL, không sửa/xoá/đổi tên entry cũ.
// Khi thêm entry, cập nhật 001_schema.sql song song để DB tạo mới cũng có schema cuối cùng — entry gặp
// đối tượng đã tồn tại sẽ được ghi nhận là đã áp dụng (xem isAlreadyPresentError).
// Không dùng CREATE INDEX CONCURRENTLY trong entry vì mỗi entry chạy trong một transaction.
const migrations: { name: string; sql: string }[] = [];

// Lỗi PostgreSQL "đối tượng đã tồn tại" (SQLSTATE): DB tạo từ 001_schema.sql đã có sẵn schema cuối cùng
// nên ALTER/CREATE của entry tương ứng báo trùng. Coi là đã áp dụng (ghi vào _migrations, đi tiếp) thay vì
// dừng cả chuỗi. Cố ý KHÔNG gồm 42P16 (invalid_table_definition): mã đó cũng dùng cho lỗi định nghĩa thật
// (vd. thêm PRIMARY KEY lần hai lẫn với cột/kiểu sai) nên nuốt nó sẽ che lỗi.
const ALREADY_PRESENT_SQLSTATE = new Set<string>([
  "42P07", // duplicate_table — cũng dùng cho relation/index/sequence trùng tên
  "42701", // duplicate_column
  "42710", // duplicate_object — constraint, trigger, role... trùng tên
  "42723", // duplicate_function
]);

function isAlreadyPresentError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code } = err as { code?: unknown };
  return typeof code === "string" && ALREADY_PRESENT_SQLSTATE.has(code);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Áp dụng các migration chưa chạy, theo thứ tự. Dừng ở entry lỗi đầu tiên và log
 * `[migrate] FAILED <name>: <message>` — server vẫn khởi động (xem main.ts) nhưng tính năng
 * cần schema mới sẽ lỗi. Trả `true` khi mọi entry đã áp dụng/đã có sẵn.
 */
export async function runMigrations(): Promise<boolean> {
  let client: PoolClient | null = null;
  let current = "(setup)";
  try {
    client = await pool.connect();
    // Tạo bảng theo dõi migration nếu chưa tồn tại
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(128) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Mảng migrations rỗng nên vòng lặp bên dưới không bao giờ phát hiện thiếu schema nền. Kiểm bảng gốc
    // `users`: chưa có = init lỗi giữa chừng hoặc backend chạy trên DB trống → báo FAILED để main.ts bỏ
    // qua seed (nếu không, seed văng và mọi request 500).
    const baseline = await client.query("SELECT to_regclass('public.users') AS t");
    if (!baseline.rows[0]?.t) {
      console.error(
        "[migrate] FAILED (baseline): chưa có schema nền — chạy infra/postgres/migrations/001_schema.sql (xem docs/guides/CHAY_LOCAL.md)",
      );
      return false;
    }

    for (const m of migrations) {
      current = m.name;
      const { rowCount } = await client.query("SELECT 1 FROM _migrations WHERE name = $1", [m.name]);
      if (rowCount) continue; // đã áp dụng rồi – bỏ qua

      // DDL của PostgreSQL có transaction: SQL của entry và dòng ghi _migrations cùng commit hoặc cùng
      // rollback, nên không có trạng thái "đã đổi schema nhưng chưa ghi nhận".
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [m.name]);
        await client.query("COMMIT");
        console.log(`[migrate] applied: ${m.name}`);
      } catch (err) {
        // Transaction đã bị đánh dấu lỗi — phải ROLLBACK trước khi dùng lại connection.
        await client.query("ROLLBACK").catch(() => undefined);
        if (!isAlreadyPresentError(err)) throw err;
        await client.query("INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [m.name]);
        console.log(`[migrate] already present (schema from 001_schema.sql): ${m.name}`);
      }
    }
    return true;
  } catch (err) {
    console.error(`[migrate] FAILED ${current}: ${errorMessage(err)}`);
    return false;
  } finally {
    client?.release();
  }
}
