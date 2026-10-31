// Chuỗi thời gian nhiệt độ/độ ẩm từ sensor_data (bảng của module telemetry) cho biểu đồ 24h / 7d.
import pool from "../../../infrastructure/database/pool";
import { queryRows, toNumberOrNull, type Queryable } from "../../../infrastructure/database/db";
import { latestReadings } from "../../devices";
import { BUCKET_SECONDS, RANGE_MS } from "../domain/telemetry-range";
import type { TelemetryRange, TelemetrySeries } from "../domain/telemetry.types";

// Chỉ nhận số thật trong JSON: `{"temperature": null}` hay chuỗi không được tính là 0 vào AVG.
// `key` chỉ nhận đúng hai literal của kiểu union (không phải input người dùng) nên nối thẳng vào SQL an toàn.
// Làm tròn 2 chữ số bằng ROUND thay vì ép NUMERIC(8,2): số lớn bất thường trong payload không làm cả truy vấn
// lỗi "numeric field overflow".
function jsonNumberSql(key: "temperature" | "humidity"): string {
  const path = `payload->'${key}'`;
  return `CASE WHEN jsonb_typeof(${path}) = 'number' THEN ROUND((payload->>'${key}')::numeric, 2) ELSE NULL END`;
}

/**
 * Chuỗi thời gian nhiệt độ/độ ẩm: AVG theo bucket 300 s (24h) hoặc 3600 s (7d), cũ → mới.
 * Bucket không có số đo nào bị bỏ; thiết bị không phải cảm biến khí hậu → `points` rỗng.
 * Hằng số bucket được nối thẳng vào SQL (không phải input người dùng) để GROUP BY gom đúng một biểu thức.
 */
export async function getTelemetrySeries(deviceId: number, range: TelemetryRange, db: Queryable = pool): Promise<TelemetrySeries> {
  const bucket = BUCKET_SECONDS[range];
  const since = new Date(Date.now() - RANGE_MS[range]);
  const rows = await queryRows<{ bucket_ts: string | number; temperature: string | number | null; humidity: string | number | null }>(
    `SELECT (FLOOR(EXTRACT(EPOCH FROM received_at) / ${bucket}) * ${bucket})::bigint AS bucket_ts,
            AVG(${jsonNumberSql("temperature")}) AS temperature,
            AVG(${jsonNumberSql("humidity")}) AS humidity
       FROM sensor_data
      WHERE device_id = ? AND received_at >= ?
      GROUP BY 1
     HAVING AVG(${jsonNumberSql("temperature")}) IS NOT NULL OR AVG(${jsonNumberSql("humidity")}) IS NOT NULL
      ORDER BY 1 ASC`,
    [deviceId, since],
    db
  );
  const round2 = (value: number | null): number | null => (value === null ? null : Math.round(value * 100) / 100);
  const latest = (await latestReadings([deviceId], db)).get(deviceId) ?? null;
  return {
    device_id: deviceId,
    range,
    bucket_seconds: bucket,
    points: rows.map((row) => ({
      t: new Date(Number(row.bucket_ts) * 1000).toISOString(),
      temperature: round2(toNumberOrNull(row.temperature)),
      humidity: round2(toNumberOrNull(row.humidity)),
    })),
    latest,
  };
}
