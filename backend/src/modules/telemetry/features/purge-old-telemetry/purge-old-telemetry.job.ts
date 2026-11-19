// Job dọn dữ liệu telemetry (CONTRACT_V2 §6). Từ khi bỏ "giữ 150 dòng/sensor" ở 2 đường ingest, job này là thứ DUY NHẤT
// giới hạn kích thước sensor_data (giữ env.telemetryRetentionDays ngày, mặc định 8 để biểu đồ 7 ngày đủ dữ liệu).
// Xoá theo lô 5000 dòng (index idx_sensor_data_received) để không giữ khoá lâu trên bảng lớn.
// Refresh token hết hạn do module identity tự dọn (features/purge-refresh-tokens) — mỗi module chỉ xoá bảng của mình.
import { env } from "../../../../config/env";
import { PURGE_BATCH_SIZE, deleteSensorDataBefore } from "../../infrastructure/sensor-data.repository";

const RUN_INTERVAL_MS = 3600 * 1000;
const FIRST_RUN_DELAY_MS = 30_000;
const MAX_BATCHES_PER_RUN = 200; // chặn vòng lặp vô hạn nếu DB bất thường (tối đa 1 triệu dòng/lần)
const DAY_MS = 24 * 3600 * 1000;

async function deleteInBatches(cutoff: Date): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const affected = await deleteSensorDataBefore(cutoff);
    total += affected;
    if (affected < PURGE_BATCH_SIZE) break;
  }
  return total;
}

async function runRetentionOnce(): Promise<void> {
  try {
    const telemetryCutoff = new Date(Date.now() - env.telemetryRetentionDays * DAY_MS);
    const deletedTelemetry = await deleteInBatches(telemetryCutoff);
    if (deletedTelemetry > 0) {
      console.log(`[retention] deleted ${deletedTelemetry} sensor_data rows`);
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
