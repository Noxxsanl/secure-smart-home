// Job tổng hợp khí hậu theo giờ: sensor_data (số đo ~1 s/lần, chỉ giữ env.telemetryRetentionDays = 8 ngày) → telemetry_history
// (avg/min/max/count mỗi thiết bị × chỉ số × giờ, giữ lâu dài) để làm dữ liệu huấn luyện AI.
//   - Ngay khi khởi động: lấp 7 ngày gần nhất (backend tắt lâu vẫn bù được trong phạm vi sensor_data còn giữ).
//   - Sau đó mỗi giờ: lấp 3 giờ gần nhất (dư để chịu được lần chạy trượt/chậm).
// Chỉ giờ TRỌN VẸN; upsert nên chạy lại vô hại. Lỗi chỉ log, không bao giờ làm sập tiến trình.
import { ROLLUP_METRICS, rollupHourly } from "../../infrastructure/telemetry-history.repository";

const RUN_INTERVAL_MS = 3600 * 1000;
const BACKFILL_HOURS = 7 * 24;
const REGULAR_HOURS = 3;

let running = false;

async function runRollupOnce(lookbackHours: number): Promise<void> {
  if (running) return; // chặn chạy chồng (lần backfill 7 ngày có thể kéo dài hơn dự kiến)
  running = true;
  try {
    let buckets = 0;
    for (const metric of ROLLUP_METRICS) {
      buckets += await rollupHourly(metric, lookbackHours);
    }
    console.log(`[rollup] telemetry_history: ${buckets} hourly buckets upserted (last ${lookbackHours}h)`);
  } catch (err) {
    console.error("[rollup] failed:", err instanceof Error ? err.message : "unknown error");
  } finally {
    running = false;
  }
}

let started = false;

export function startTelemetryRollup(): void {
  if (started) return;
  started = true;
  void runRollupOnce(BACKFILL_HOURS);
  setInterval(() => void runRollupOnce(REGULAR_HOURS), RUN_INTERVAL_MS).unref();
}
