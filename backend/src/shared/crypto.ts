// Primitive mật mã dùng chung. Gom về một chỗ để mọi nơi sinh UID/secret/token
// đều dùng crypto.randomBytes (CSPRNG) và so sánh chữ ký bằng timingSafeEqual.
import crypto from "crypto";

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Token ngẫu nhiên base64url (refresh token: 32 byte). Chỉ lưu sha256Hex() của nó. */
export function randomTokenBase64Url(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Secret thiết bị: 32 byte hex — chỉ trả 1 lần (invariant 1), không bao giờ log. */
export function randomSecretHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/** UID thiết bị: prefix + 12 ký tự hex HOA, ví dụ generateUid("ESP32-GW-") → "ESP32-GW-3FA9C01B7D22". */
export function generateUid(prefix: string): string {
  return `${prefix}${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

/**
 * HMAC-SHA256 hex thường. Key là CHUỖI secret nguyên văn (không decode hex) — khớp
 * modules/devices/domain/hmac.service.ts, firmware và tests/security/attack_demo*.sh (invariant 5).
 */
export function hmacHex(key: string, message: string): string {
  return crypto.createHmac("sha256", key).update(message).digest("hex");
}

/**
 * So sánh 2 chuỗi hex không rò rỉ thời gian. Độ dài khác hoặc không phải hex → false
 * (timingSafeEqual ném lỗi nếu 2 buffer khác độ dài nên phải kiểm trước).
 */
export function safeEqualHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-fA-F]*$/.test(actual) || expected.length !== actual.length || expected.length % 2 !== 0) {
    return false;
  }
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(actual, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function newUuid(): string {
  return crypto.randomUUID();
}
