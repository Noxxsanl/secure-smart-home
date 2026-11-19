// Miền hợp lệ của số đo khí hậu — MỘT bộ hằng dùng chung cho mọi nơi đọc nhiệt độ/độ ẩm từ payload: tách khí hậu ở ingest
// (ingest-common), khí hậu phòng (room-climate.read-model) và rollup theo giờ (telemetry-history.repository).
// Vì sao cần: payload sensor đúng HMAC vẫn có thể mang số vô nghĩa ({"temperature": 1e9}); AVG của nó tràn NUMERIC(12,4)
// làm hỏng TOÀN BỘ câu INSERT … SELECT rollup của mọi nhà, còn ghi vào user_behavior_logs.temperature NUMERIC(5,2) thì lỗi
// làm mất dòng hành vi. Nhiệt độ theo dải đo của SHT31 (−40…125 °C), độ ẩm 0…100 %; ngoài miền = bỏ qua, không phải lỗi.

export type ClimateMetric = "temperature" | "humidity";

export const CLIMATE_RANGE: Readonly<Record<ClimateMetric, { readonly min: number; readonly max: number }>> = {
  temperature: { min: -40, max: 125 },
  humidity: { min: 0, max: 100 },
};

/** Số hữu hạn nằm trong miền của chỉ số. */
export function isClimateInRange(metric: ClimateMetric, value: number): boolean {
  const { min, max } = CLIMATE_RANGE[metric];
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Giá trị JSON → số khí hậu hợp lệ; sai kiểu (chuỗi, null, boolean…) hoặc ngoài miền → null. */
export function parseClimateValue(metric: ClimateMetric, value: unknown): number | null {
  return typeof value === "number" && isClimateInRange(metric, value) ? value : null;
}
