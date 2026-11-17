// Kiểm đầu vào do THIẾT BỊ gửi (topic MQTT, body/header của /api/device/**) — hàm thuần, không chạm DB/env nên
// module devices (xác thực HMAC) và telemetry (parse envelope) dùng chung được, và test độc lập được.
//
// PostgreSQL không chứa được ký tự NUL trong TEXT/VARCHAR (lỗi 22021) và JSONB không nhận `\u0000` (22P05) — nếu để lọt
// xuống DB, thiết bị/kẻ gửi tuỳ ý gây 500 thay vì bị coi là dữ liệu sai.

/** Cửa sổ chấp nhận timestamp thiết bị ±300 giây (giống AWS SigV4/TOTP; đồng hồ ESP32 có thể lệch nhẹ). */
export const TIMESTAMP_WINDOW_SECONDS = 300;

/** device_id gửi lên phải là chuỗi (không phải số/object/mảng) và không chứa ký tự NUL. */
export function isSafeDeviceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\0");
}

/**
 * UID lấy từ nguồn không tin cậy (topic MQTT, header HTTP, envelope v2) trước khi dùng hoặc đưa vào log/chuỗi ký:
 * chỉ chữ, số, `_ . : -`, 1–64 ký tự — không có xuống dòng/ký tự điều khiển (chống log injection) và không có `|`
 * (ký tự phân tách của chuỗi ký v2, xem modules/devices/domain/signature-v2.ts).
 */
const WELL_FORMED_UID = /^[A-Za-z0-9_.:-]{1,64}$/;
export function isWellFormedUid(value: unknown): value is string {
  return typeof value === "string" && WELL_FORMED_UID.test(value);
}

/** JSON đã stringify có chứa `\u0000` (escape thật, không tính `\\u0000` = backslash + chữ "u0000") hay không. */
export function jsonHasNul(json: string): boolean {
  return /(^|[^\\])(\\\\)*\\u0000/.test(json);
}

/** Timestamp (unix giây) nằm trong cửa sổ ±300 s — dùng chung cho ingest HTTP/MQTT, heartbeat gateway, sự kiện camera. */
export function isTimestampValid(timestamp: number, nowMs: number = Date.now()): boolean {
  return Number.isFinite(timestamp) && Math.abs(nowMs / 1000 - timestamp) <= TIMESTAMP_WINDOW_SECONDS;
}

/** Chữ ký HMAC-SHA256 dạng hex: đúng 64 ký tự hex (hoa hoặc thường). */
export function isHmacHex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F]{64}$/.test(value);
}

/** Unix timestamp giây: số nguyên dương an toàn (cJSON của firmware gửi số, không gửi chuỗi). */
export function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Bộ đếm chống phát lại (sn_ctr) của telemetry v2: số nguyên dương an toàn của JS (≤ 2^53 − 1, vừa BIGINT và double cJSON). */
export function isValidCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** IP do firmware tự báo (gateway_ip): chỉ ký tự địa chỉ IPv4/IPv6, tối đa 45 (cột last_ip VARCHAR(45)). */
export function isDeviceIp(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F.:]{1,45}$/.test(value);
}
