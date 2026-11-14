// SQL bảng telemetry_history (module telemetry là chủ duy nhất): trung bình/min/max nhiệt độ-độ ẩm theo giờ, tổng hợp từ
// sensor_data. sensor_data chỉ giữ TELEMETRY_RETENTION_DAYS ngày (job purge-old-telemetry) nên bảng này là nơi lưu lâu dài
// chuỗi khí hậu phòng — làm dữ liệu huấn luyện AI cùng với user_behavior_logs (npm run export:behavior).
import pool from "../../../infrastructure/database/pool";
import { runSql, type Queryable } from "../../../infrastructure/database/db";
import { CLIMATE_RANGE, type ClimateMetric } from "../domain/climate-range";
import { jsonNumberSql } from "./telemetry-series.repository";

export type RollupMetric = ClimateMetric;
export const ROLLUP_METRICS: readonly RollupMetric[] = ["temperature", "humidity"];

/**
 * Tổng hợp theo giờ cho MỘT chỉ số: các giờ TRỌN VẸN (bucket_start < đầu giờ hiện tại) trong `lookbackHours` giờ gần nhất.
 * Upsert theo (device_id, metric, bucket_type, bucket_start) nên chạy lại bao nhiêu lần cũng ra cùng kết quả. home_id/room_id
 * lấy từ devices LÚC tổng hợp (thiết bị chuyển phòng thì các giờ sau mang phòng mới). Chỉ giá trị JSON là số mới được tính.
 * Trả số bucket đã ghi. `metric` là literal của kiểu union (không phải input người dùng) nên nối thẳng vào SQL an toàn;
 * giờ lùi cũng là số nguyên nội bộ, truyền bằng placeholder.
 */
export async function rollupHourly(metric: RollupMetric, lookbackHours: number, db: Queryable = pool): Promise<number> {
  // Lọc miền (CLIMATE_RANGE) ở SELECT NGOÀI, sau khi subquery đã ép số an toàn bằng CASE (jsonNumberSql — ép NUMERIC không
  // có giới hạn độ rộng nên không tràn): một số vô nghĩa như 1e9 bị bỏ qua thay vì làm AVG tràn NUMERIC(12,4) và hỏng
  // toàn bộ INSERT … SELECT của mọi nhà. Kết quả không phụ thuộc thứ tự planner đánh giá các điều kiện.
  const { min, max } = CLIMATE_RANGE[metric];
  // arch-allow T2: INSERT … SELECT cần nguyên tử trong 1 câu — đọc devices (home_id/room_id) chỉ để gắn nhà/phòng cho bucket
  const sql = `INSERT INTO telemetry_history
         (device_id, home_id, room_id, metric, bucket_type, bucket_start, avg_value, min_value, max_value, sample_count)
       SELECT s.device_id, d.home_id, d.room_id, '${metric}', 'hourly', date_trunc('hour', s.received_at),
              AVG(s.v), MIN(s.v), MAX(s.v), COUNT(*)
         FROM (SELECT device_id, received_at, ${jsonNumberSql(metric)} AS v
                 FROM sensor_data
                WHERE received_at >= date_trunc('hour', NOW()) - make_interval(hours => ?::int)
                  AND received_at <  date_trunc('hour', NOW())) s
         JOIN devices d ON d.id = s.device_id
        WHERE s.v IS NOT NULL AND s.v >= ? AND s.v <= ?
        GROUP BY s.device_id, d.home_id, d.room_id, date_trunc('hour', s.received_at)
       ON CONFLICT (device_id, metric, bucket_type, bucket_start) DO UPDATE
          SET avg_value = EXCLUDED.avg_value, min_value = EXCLUDED.min_value,
              max_value = EXCLUDED.max_value, sample_count = EXCLUDED.sample_count`;
  const result = await runSql(sql, [lookbackHours, min, max], db);
  return result.affectedRows;
}
