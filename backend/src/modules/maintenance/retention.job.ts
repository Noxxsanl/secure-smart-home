// Job dọn dữ liệu (CONTRACT_V2 §6). Từ khi bỏ "giữ 150 dòng/sensor" ở 2 đường ingest, job này là thứ DUY NHẤT
// giới hạn kích thước sensor_data (giữ env.telemetryRetentionDays ngày, mặc định 8 để biểu đồ 7 ngày đủ dữ liệu).
// Xoá theo lô 5000 dòng (index idx_sensor_data_received) để không giữ khoá lâu trên bảng lớn.
import { env } from "../../config/env";
import { runSql } from "../../lib/db";

const RUN_INTERVAL_MS = 3600 * 1000;
const FIRST_RUN_DELAY_MS = 30_000;
const BATCH_SIZE = 5000;
const MAX_BATCHES_PER_RUN = 200; // chặn vòng lặp vô hạn nếu DB bất thường (tối đa 1 triệu dòng/lần)
const REFRESH_TOKEN_GRACE_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

// PostgreSQL không có DELETE … ORDER BY/LIMIT như MySQL: chọn id của một lô trong truy vấn con rồi xoá theo id.
// BATCH_SIZE là hằng số nội bộ (không phải input) nên nối thẳng vào SQL.
const DELETE_TELEMETRY_SQL = `DELETE FROM sensor_data WHERE id IN (
  SELECT id FROM sensor_data WHERE received_at < ? ORDER BY received_at LIMIT ${BATCH_SIZE})`;
const DELETE_TOKENS_SQL = `DELETE FROM refresh_tokens WHERE id IN (
  SELECT id FROM refresh_tokens WHERE expires_at < ? LIMIT ${BATCH_SIZE})`;

async function deleteInBatches(sql: string, cutoff: Date): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const result = await runSql(sql, [cutoff]);
    total += result.affectedRows;
    if (result.affectedRows < BATCH_SIZE) break;
  }
  return total;
}

async function runRetentionOnce(): Promise<void> {
  try {
    const telemetryCutoff = new Date(Date.now() - env.telemetryRetentionDays * DAY_MS);
    const deletedTelemetry = await deleteInBatches(DELETE_TELEMETRY_SQL, telemetryCutoff);
    // Giữ token hết hạn thêm 7 ngày: phát hiện dùng lại token cũ (reuse detection) còn cần dấu vết của chúng
    const tokenCutoff = new Date(Date.now() - REFRESH_TOKEN_GRACE_DAYS * DAY_MS);
    const deletedTokens = await deleteInBatches(DELETE_TOKENS_SQL, tokenCutoff);
    if (deletedTelemetry > 0 || deletedTokens > 0) {
      console.log(`[retention] deleted ${deletedTelemetry} sensor_data rows, ${deletedTokens} refresh tokens`);
    }
  } catch (err) {
    console.error("[retention] failed:", err instanceof Error ? err.message : "unknown error");
  }
}

let started = false;

export function startRetentionJob(): void {
  if (started) return;
  started = true;
  const first = setTimeout(() => void runRetentionOnce(), FIRST_RUN_DELAY_MS);
  const timer = setInterval(() => void runRetentionOnce(), RUN_INTERVAL_MS);
  first.unref();
  timer.unref();
}
