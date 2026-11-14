// Bước dùng chung của HAI đường ingest (HTTP fallback và MQTT) — invariant 4: cả hai gọi đúng hàm này (và cùng
// verifyGatewayHMAC / verifyDeviceHMAC / registerAuthFailure / listGatewayAndSensorTypeStatus của module devices)
// nên không thể lệch nhau về cách cập nhật trạng thái thiết bị.
import { isValidAcCodes, isValidAcSetpoint, markDeviceSeen, parseReportedCurtainPos, syncNodeAppliances } from "../../devices";
import type { NodeApplianceReport } from "../../devices";
import { parseClimateValue } from "./climate-range";

/** Bật/tắt trong số đo: 0/1 hoặc boolean; khác → null (bỏ qua). */
function parseOnOff(value: unknown): boolean | null {
  return value === true || value === 1 ? true : value === false || value === 0 ? false : null;
}

/** Rèm: số 0..100 (0 = đóng hẳn, > 0 = mở — Node gửi 2..100 = % mở, 1 = mở chưa rõ %) hoặc boolean; khác → null. */
function parseCurtainOpen(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) return value > 0;
  return null;
}

/**
 * Node phòng khách báo trạng thái các thiết bị nó điều khiển trong số đo: `lamp`, `fan`, `ac` (0/1 hoặc boolean),
 * `curtain` (0 = đóng, 2..100 = % mở, 1 = mở chưa rõ % → chỉ power_state, giữ curtain_pos), `ac_temp` (số nguyên 16..30) và `ac_codes` (bitmask mã IR đã học, số nguyên
 * 0..65535). Mỗi khoá chỉ có khi Node đã biết trạng thái (gói có thể chỉ mang một phần); thiếu hoặc sai kiểu/miền → null
 * (bỏ qua, giữ giá trị trong DB, KHÔNG từ chối gói số đo).
 */
export function parseApplianceReport(data: unknown): NodeApplianceReport {
  const raw = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  // Nhiệt độ/độ ẩm của chính gói này → ngữ cảnh cho nhật ký hành vi khi trạng thái tải đổi (appliance_changed)
  // (miền chung ở climate-range.ts: ngoài dải SHT31 → null, không làm hỏng dòng hành vi NUMERIC(5,2))
  const temperature = parseClimateValue("temperature", raw.temperature);
  const humidity = parseClimateValue("humidity", raw.humidity);
  return {
    climate: temperature === null && humidity === null ? null : { temperature, humidity },
    power: {
      lamp: parseOnOff(raw.lamp),
      fan: parseOnOff(raw.fan),
      curtain: parseCurtainOpen(raw.curtain),
      ac: parseOnOff(raw.ac),
    },
    acSetpoint: isValidAcSetpoint(raw.ac_temp) ? raw.ac_temp : null,
    acCodes: isValidAcCodes(raw.ac_codes) ? raw.ac_codes : null,
    curtainPos: parseReportedCurtainPos(raw.curtain),
  };
}

/**
 * Sau khi INSERT sensor_data và chạy onTelemetryIngested: last_seen = NOW(), fail_count = 0 cho gateway rồi sensor
 * (đúng thứ tự này). IP khác null (kể cả chuỗi rỗng) → ghi thêm last_ip; null → giữ IP cũ.
 *
 * Rồi đồng bộ các thiết bị THẬT của sensor này (`<uid>-lamp|fan|curtain|ac`): last_seen theo Node cha + power_state từ
 * `data.lamp` / `data.fan` / `data.curtain` / `data.ac`, ac_setpoint / ac_codes từ `data.ac_temp` / `data.ac_codes`. Lỗi
 * ở bước này không được làm hỏng ingest (số đo đã lưu).
 */
export async function markGatewayAndSensorSeen(
  gatewayDbId: number,
  gatewayIp: string | null,
  sensorDbId: number,
  sensorIp: string | null,
  data: unknown
): Promise<void> {
  await markDeviceSeen(gatewayDbId, gatewayIp);
  await markDeviceSeen(sensorDbId, sensorIp);
  try {
    await syncNodeAppliances(sensorDbId, parseApplianceReport(data));
  } catch (err) {
    console.error("[telemetry] syncNodeAppliances failed:", err instanceof Error ? err.message : "unknown error");
  }
}

/**
 * Loại sự kiện audit khi xác thực HMAC thất bại — dùng chung HTTP + MQTT (invariant 4) để Log Center và demo tấn công
 * thấy cùng một loại cho cùng một lỗi: timestamp ngoài cửa sổ ±300 s là REPLAY_ATTACK, còn lại là *_AUTH_FAIL.
 */
export function authFailureEventType(level: "gateway" | "sensor", error: string | undefined): string {
  if (error === "TIMESTAMP_EXPIRED") return "REPLAY_ATTACK";
  return level === "gateway" ? "GATEWAY_AUTH_FAIL" : "SENSOR_AUTH_FAIL";
}
