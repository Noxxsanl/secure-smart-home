// Nhiệt độ/độ ẩm gần nhất của một PHÒNG, từ sensor_data của các thiết bị cùng phòng (JOIN devices của module devices nên
// là read-model, chỉ đọc). Dùng cho nhật ký hành vi khi gói telemetry làm đổi trạng thái không mang số đo khí hậu
// (lệnh từ web: ack về, Node chưa kịp gửi số đo).
import pool from "../../../infrastructure/database/pool";
import { queryOne, toNumberOrNull, type Queryable } from "../../../infrastructure/database/db";
import { CLIMATE_RANGE, isClimateInRange, type ClimateMetric } from "../domain/climate-range";
import type { RoomClimate } from "../domain/telemetry.types";

// Chỉ nhận số thật trong JSON (như telemetry-series.repository): null/chuỗi không được tính. `key` là literal của kiểu
// union, không phải input người dùng nên nối thẳng vào SQL an toàn. Số ngoài miền CLIMATE_RANGE (vd 1e9 từ sensor lỗi)
// bị loại ở SELECT ngoài — sau khi subquery đã ép số an toàn bằng CASE — để không làm INSERT user_behavior_logs
// (NUMERIC(5,2)) lỗi và mất dòng hành vi; số hợp lệ mới nhất còn trong cửa sổ vẫn được dùng, không có → null.
async function latestValue(roomId: number, key: ClimateMetric, from: Date, to: Date, db: Queryable): Promise<number | null> {
  const { min, max } = CLIMATE_RANGE[key];
  const row = await queryOne<{ value: string | number | null }>(
    `SELECT v.value
       FROM (SELECT s.received_at,
                    CASE WHEN jsonb_typeof(s.payload->'${key}') = 'number' THEN ROUND((s.payload->>'${key}')::numeric, 2) ELSE NULL END AS value
               FROM sensor_data s
               JOIN devices d ON d.id = s.device_id
              WHERE d.room_id = ? AND s.received_at >= ? AND s.received_at <= ?) v
      WHERE v.value >= ? AND v.value <= ?
      ORDER BY v.received_at DESC
      LIMIT 1`,
    [roomId, from, to, min, max],
    db
  );
  const value = toNumberOrNull(row?.value);
  return value !== null && isClimateInRange(key, value) ? value : null;
}

/**
 * Giá trị MỚI NHẤT của từng chỉ số trong cửa sổ [at − windowMs, at] của các cảm biến cùng phòng; chỉ số không có số đo → null.
 * Không bao giờ ném lỗi: thiếu khí hậu không được làm mất dòng hành vi.
 */
export async function findRoomClimate(roomId: number, at: Date, windowMs: number, db: Queryable = pool): Promise<RoomClimate> {
  const from = new Date(at.getTime() - windowMs);
  try {
    const [temperature, humidity] = await Promise.all([
      latestValue(roomId, "temperature", from, at, db),
      latestValue(roomId, "humidity", from, at, db),
    ]);
    return { temperature, humidity };
  } catch (err) {
    console.error("[telemetry] room climate lookup failed:", err instanceof Error ? err.message : "unknown error");
    return { temperature: null, humidity: null };
  }
}
