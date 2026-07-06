import crypto from "crypto";
import pool from "../config/db";

// Cửa sổ chống replay attack ±300 giây. Đồng hồ cảm biến có thể lệch nhẹ,
// cửa sổ quá hẹp sẽ gây lỗi TIMESTAMP_EXPIRED giả; 5 phút là tiêu chuẩn ngành
// (giống AWS Signature v4 và TOTP).
const TIMESTAMP_WINDOW_SECONDS = 300;

interface DeviceRow {
  id: number;
  secret_key: string;
  status: "inactive" | "active" | "blocked";
  fail_count: number;
}

async function fetchDevice(device_id: string): Promise<DeviceRow | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, secret_key, status, fail_count FROM devices WHERE device_id = ? LIMIT 1`,
    [device_id]
  );
  return rows.length > 0 ? (rows[0] as DeviceRow) : null;
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

export interface HMACVerifyResult {
  ok: boolean;
  device?: DeviceRow & { device_id: string };
  error?: "NOT_FOUND" | "TIMESTAMP_EXPIRED" | "HMAC_MISMATCH" | "DEVICE_BLOCKED";
}

export async function verifyGatewayHMAC(
  gateway_id: string,
  gw_timestamp: number,
  gw_hmac: string
): Promise<HMACVerifyResult> {
  const device = await fetchDevice(gateway_id);
  if (!device) return { ok: false, error: "NOT_FOUND" };

  if (!isTimestampValid(gw_timestamp)) return { ok: false, device: { ...device, device_id: gateway_id }, error: "TIMESTAMP_EXPIRED" };

  const expected = computeHMAC(device.secret_key, `${gateway_id}:${gw_timestamp}`).toString("hex");
  if (!safeCompare(expected, gw_hmac)) return { ok: false, device: { ...device, device_id: gateway_id }, error: "HMAC_MISMATCH" };

  return { ok: true, device: { ...device, device_id: gateway_id } };
}

export async function verifyDeviceHMAC(
  sensor_id: string,
  sn_timestamp: number,
  sn_hmac: string
): Promise<HMACVerifyResult> {
  const device = await fetchDevice(sensor_id);
  if (!device) return { ok: false, error: "NOT_FOUND" };

  if (!isTimestampValid(sn_timestamp)) return { ok: false, device: { ...device, device_id: sensor_id }, error: "TIMESTAMP_EXPIRED" };

  const expected = computeHMAC(device.secret_key, `${sensor_id}:${sn_timestamp}`).toString("hex");
  if (!safeCompare(expected, sn_hmac)) return { ok: false, device: { ...device, device_id: sensor_id }, error: "HMAC_MISMATCH" };

  return { ok: true, device: { ...device, device_id: sensor_id } };
}
