// Bước dùng chung của HAI đường ingest (HTTP fallback và MQTT) — invariant 4: cả hai gọi đúng hàm này (và cùng
// verifyGatewayHMAC / verifyDeviceHMAC / registerAuthFailure / listGatewayAndSensorTypeStatus của module devices)
// nên không thể lệch nhau về cách cập nhật trạng thái thiết bị.
import { markDeviceSeen } from "../../devices";

/**
 * Sau khi INSERT sensor_data và chạy onTelemetryIngested: last_seen = NOW(), fail_count = 0 cho gateway rồi sensor
 * (đúng thứ tự này). IP khác null (kể cả chuỗi rỗng) → ghi thêm last_ip; null → giữ IP cũ.
 */
export async function markGatewayAndSensorSeen(
  gatewayDbId: number,
  gatewayIp: string | null,
  sensorDbId: number,
  sensorIp: string | null
): Promise<void> {
  await markDeviceSeen(gatewayDbId, gatewayIp);
  await markDeviceSeen(sensorDbId, sensorIp);
}

/**
 * Loại sự kiện audit khi xác thực HMAC thất bại — dùng chung HTTP + MQTT (invariant 4) để Log Center và demo tấn công
 * thấy cùng một loại cho cùng một lỗi: timestamp ngoài cửa sổ ±300 s là REPLAY_ATTACK, còn lại là *_AUTH_FAIL.
 */
export function authFailureEventType(level: "gateway" | "sensor", error: string | undefined): string {
  if (error === "TIMESTAMP_EXPIRED") return "REPLAY_ATTACK";
  return level === "gateway" ? "GATEWAY_AUTH_FAIL" : "SENSOR_AUTH_FAIL";
}
