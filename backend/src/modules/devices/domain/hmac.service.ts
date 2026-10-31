// Xác thực HMAC thiết bị — chủ của secret_key. Chuỗi ký HMAC-SHA256(secret, "<device_id>:<unix_ts>") hex thường
// phải khớp byte-by-byte với gateway và sensor firmware (invariant 5).
import crypto from "crypto";
import { fetchDeviceForAuth, type DeviceAuthRow } from "../infrastructure/device-secret.repository";

// Cửa sổ chống replay attack ±300 giây. Đồng hồ cảm biến có thể lệch nhẹ,
// cửa sổ quá hẹp sẽ gây lỗi TIMESTAMP_EXPIRED giả; 5 phút là tiêu chuẩn ngành
// (giống AWS Signature v4 và TOTP).
const TIMESTAMP_WINDOW_SECONDS = 300;

// Dùng CHUNG cho HTTP (telemetry/features/ingest-http: middleware validate-device; devices/features/list-gateway-sensors)
// và MQTT (telemetry/features/ingest-mqtt) để hai đường từ chối cùng một tập đầu vào (invariant 4). PostgreSQL không
// chứa được ký tự NUL trong TEXT/VARCHAR (lỗi 22021) và JSONB không nhận `\u0000` (22P05) — nếu để lọt xuống DB,
// thiết bị/kẻ gửi tuỳ ý gây 500 thay vì bị coi là dữ liệu sai.

/** device_id gửi lên phải là chuỗi (không phải số/object/mảng) và không chứa ký tự NUL. */
export function isSafeDeviceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\0");
}

/** JSON đã stringify có chứa `\u0000` (escape thật, không tính `\\u0000` = backslash + chữ "u0000") hay không. */
export function jsonHasNul(json: string): boolean {
  return /(^|[^\\])(\\\\)*\\u0000/.test(json);
}

function isTimestampValid(timestamp: number): boolean {
  return Math.abs(Date.now() / 1000 - timestamp) <= TIMESTAMP_WINDOW_SECONDS;
}

function computeHMAC(secret: string, message: string): Buffer {
  return crypto.createHmac("sha256", secret).update(message).digest();
}

// timingSafeEqual ngăn tấn công side-channel dựa trên thời gian so sánh từng ký tự,
// qua đó kẻ tấn công không thể đoán được giá trị HMAC mong đợi.
// Độ dài hai buffer phải bằng nhau trước khi gọi timingSafeEqual, không nó sẽ throw.
function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Thiết bị đã tra được theo UID, KHÔNG kèm secret_key: kết quả này được module telemetry giữ (gắn vào request,
 * truyền qua handler) nên secret chỉ sống trong hàm verify của module devices (invariant 1).
 */
export type VerifiedDevice = Omit<DeviceAuthRow, "secret_key"> & { device_id: string };

export interface HMACVerifyResult {
  ok: boolean;
  device?: VerifiedDevice;
  error?: "NOT_FOUND" | "TIMESTAMP_EXPIRED" | "HMAC_MISMATCH" | "DEVICE_BLOCKED";
}

function describe(row: DeviceAuthRow, deviceUid: string): VerifiedDevice {
  return { id: row.id, status: row.status, fail_count: row.fail_count, device_id: deviceUid };
}

export async function verifyGatewayHMAC(
  gateway_id: string,
  gw_timestamp: number,
  gw_hmac: string
): Promise<HMACVerifyResult> {
  const device = await fetchDeviceForAuth(gateway_id);
  if (!device) return { ok: false, error: "NOT_FOUND" };

  if (!isTimestampValid(gw_timestamp)) return { ok: false, device: describe(device, gateway_id), error: "TIMESTAMP_EXPIRED" };

  const expected = computeHMAC(device.secret_key, `${gateway_id}:${gw_timestamp}`).toString("hex");
  if (!safeCompare(expected, gw_hmac)) return { ok: false, device: describe(device, gateway_id), error: "HMAC_MISMATCH" };

  return { ok: true, device: describe(device, gateway_id) };
}

export async function verifyDeviceHMAC(
  sensor_id: string,
  sn_timestamp: number,
  sn_hmac: string
): Promise<HMACVerifyResult> {
  const device = await fetchDeviceForAuth(sensor_id);
  if (!device) return { ok: false, error: "NOT_FOUND" };

  if (!isTimestampValid(sn_timestamp)) return { ok: false, device: describe(device, sensor_id), error: "TIMESTAMP_EXPIRED" };

  const expected = computeHMAC(device.secret_key, `${sensor_id}:${sn_timestamp}`).toString("hex");
  if (!safeCompare(expected, sn_hmac)) return { ok: false, device: describe(device, sensor_id), error: "HMAC_MISMATCH" };

  return { ok: true, device: describe(device, sensor_id) };
}
