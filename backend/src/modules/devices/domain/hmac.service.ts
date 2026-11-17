// Xác thực HMAC thiết bị — chủ của secret_key (bất biến 1, 5). Chuỗi ký telemetry (API_DESIGN §3):
//   v2 (mặc định, domain/signature-v2.ts): Node ký "v2|sn|<sensor_id>|<ts>|<ctr>|<sha256_hex(data_raw)>" — phủ nội dung +
//       bộ đếm chống phát lại; Gateway ký "v2|gw|<gateway_id>|<ts>|<gateway_ip>|<sensor_id>|<ctr>|<sn_hmac>".
//   v1 "<device_id>:<unix_ts>" — KHÔNG ký nội dung, chỉ có cửa sổ thời gian; telemetry chỉ nhận khi DEVICE_HMAC_V1=true
//       (chuyển đổi phần cứng cũ). Heartbeat gateway vẫn ký "<gateway_id>:<ts>" (giờ chỉ chính gateway publish được topic
//       của nó nhờ mTLS + ACL của broker).
// Secret đọc qua device-secret.repository (đã giải mã) và chỉ sống trong các hàm dưới, không bao giờ log (bất biến 2).
import { isTimestampValid } from "../../../shared/validation/device-input";
import { fetchDeviceForAuth, type DeviceAuthRow } from "../infrastructure/device-secret.repository";
import {
  gatewayMessageV2,
  sensorMessageV2,
  verifyMessage,
  type GatewayTelemetryFieldsV2,
  type SensorTelemetryFieldsV2,
} from "./signature-v2";

// Kiểm đầu vào thiết bị dùng chung HTTP + MQTT (invariant 4) — định nghĩa ở shared để telemetry dùng mà không kéo DB.
export {
  isDeviceIp,
  isHmacHex,
  isSafeDeviceId,
  isTimestampValid,
  isUnixSeconds,
  isValidCounter,
  isWellFormedUid,
  jsonHasNul,
} from "../../../shared/validation/device-input";
export { COUNTER_MAX_AHEAD_MS, isCounterInRange } from "./signature-v2";
export type { GatewayTelemetryFieldsV2, SensorTelemetryFieldsV2 } from "./signature-v2";

/**
 * Thiết bị đã tra được theo UID, KHÔNG kèm secret_key: kết quả này được module telemetry giữ (gắn vào request,
 * truyền qua handler) nên secret chỉ sống trong hàm verify của module devices (invariant 1).
 */
export type VerifiedDevice = Omit<DeviceAuthRow, "secret_key"> & { device_id: string };

export interface HMACVerifyResult {
  ok: boolean;
  device?: VerifiedDevice;
  /**
   * SECRET_UNAVAILABLE: secret lưu dạng mã hoá mà server thiếu/sai DEVICE_SECRET_KEY — lỗi cấu hình server, KHÔNG được
   * tính là thiết bị sai chữ ký (không tăng fail_count).
   */
  error?: "NOT_FOUND" | "TIMESTAMP_EXPIRED" | "HMAC_MISMATCH" | "DEVICE_BLOCKED" | "SECRET_UNAVAILABLE";
}

function describe(row: DeviceAuthRow, deviceUid: string): VerifiedDevice {
  const { secret_key: _secret, ...rest } = row;
  return { ...rest, device_id: deviceUid };
}

/** Tra thiết bị → kiểm cửa sổ thời gian → so HMAC(secret, message) thời gian hằng. */
async function verifySigned(deviceUid: string, timestamp: number, message: string, signature: string): Promise<HMACVerifyResult> {
  const row = await fetchDeviceForAuth(deviceUid);
  if (!row) return { ok: false, error: "NOT_FOUND" };
  const device = describe(row, deviceUid);
  if (!isTimestampValid(timestamp)) return { ok: false, device, error: "TIMESTAMP_EXPIRED" };
  if (row.secret_key === null) return { ok: false, device, error: "SECRET_UNAVAILABLE" };
  if (!verifyMessage(row.secret_key, message, signature)) return { ok: false, device, error: "HMAC_MISMATCH" };
  return { ok: true, device };
}

// ── v1: "<device_id>:<unix_ts>" ─────────────────────────────────────────────

export function verifyGatewayHMAC(gateway_id: string, gw_timestamp: number, gw_hmac: string): Promise<HMACVerifyResult> {
  return verifySigned(gateway_id, gw_timestamp, `${gateway_id}:${gw_timestamp}`, gw_hmac);
}

export function verifyDeviceHMAC(sensor_id: string, sn_timestamp: number, sn_hmac: string): Promise<HMACVerifyResult> {
  return verifySigned(sensor_id, sn_timestamp, `${sensor_id}:${sn_timestamp}`, sn_hmac);
}

// ── v2: ký nội dung + bộ đếm (domain/signature-v2.ts) ───────────────────────

export function verifyGatewayTelemetryV2(fields: GatewayTelemetryFieldsV2, gw_hmac: string): Promise<HMACVerifyResult> {
  return verifySigned(fields.gatewayId, fields.gwTimestamp, gatewayMessageV2(fields), gw_hmac);
}

export function verifySensorTelemetryV2(fields: SensorTelemetryFieldsV2, sn_hmac: string): Promise<HMACVerifyResult> {
  return verifySigned(fields.sensorId, fields.snTimestamp, sensorMessageV2(fields), sn_hmac);
}
