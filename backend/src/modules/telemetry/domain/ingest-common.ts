// Bước dùng chung của HAI đường ingest (HTTP fallback và MQTT) — invariant 4: cả hai gọi đúng hàm này (và cùng
// verifyGatewayHMAC / verifyDeviceHMAC / registerAuthFailure / listGatewayAndSensorTypeStatus của module devices)
// nên không thể lệch nhau về cách cập nhật trạng thái thiết bị.
import { isValidAcCodes, isValidAcSetpoint, markDeviceSeen, syncNodeAppliances } from "../../devices";
import type { NodeApplianceReport } from "../../devices";

/**
 * Node phòng khách báo trạng thái điều hoà IR trong số đo: `ac` (0/1 hoặc boolean) và `ac_temp` (số nguyên 16..30).
 * Kèm `ac_codes` (bitmask mã IR đã học, số nguyên 0..65535). Mỗi khoá chỉ có khi Node đã biết trạng thái; thiếu hoặc sai kiểu/miền → null (bỏ qua, KHÔNG từ chối gói số đo).
 */
export function parseApplianceReport(data: unknown): NodeApplianceReport {
  const raw = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const ac = raw.ac;
  const acPower = ac === true || ac === 1 ? true : ac === false || ac === 0 ? false : null;
  const acSetpoint = isValidAcSetpoint(raw.ac_temp) ? raw.ac_temp : null;
  const acCodes = isValidAcCodes(raw.ac_codes) ? raw.ac_codes : null;
  return { acPower, acSetpoint, acCodes };
}

/**
 * Sau khi INSERT sensor_data và chạy onTelemetryIngested: last_seen = NOW(), fail_count = 0 cho gateway rồi sensor
 * (đúng thứ tự này). IP khác null (kể cả chuỗi rỗng) → ghi thêm last_ip; null → giữ IP cũ.
 *
 * Rồi đồng bộ các relay THẬT của sensor này (điều hoà `<uid>-ac`): last_seen theo Node cha + power_state/ac_setpoint
 * từ `data.ac` / `data.ac_temp` / `data.ac_codes`. Lỗi ở bước này không được làm hỏng ingest (số đo đã lưu).
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
