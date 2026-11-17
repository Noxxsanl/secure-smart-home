// Mã hoá secret thiết bị khi lưu (FR-12.8): devices.secret_key chứa bản mã AES-256-GCM thay vì bản rõ.
// Hàm THUẦN — khoá truyền vào (infrastructure/device-secret.repository đọc từ env DEVICE_SECRET_KEY) để test độc lập.
//
//   định dạng: "enc1:" + base64url(iv 12 byte) + "." + base64url(bản mã) + "." + base64url(tag 16 byte)
//   AAD: "device-secret|<device_id>" — bản mã gắn với đúng thiết bị: chép bản mã sang dòng khác thì không mở được.
//
// Dữ liệu cũ (bản rõ, không có tiền tố) vẫn đọc được để chuyển đổi dần: worker seal-secrets mã hoá lại các dòng đó.
// Không bao giờ log secret hay bản mã (bất biến 2).
import crypto from "crypto";

const PREFIX = "enc1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const SECRET_KEY_BYTES = 32;

/** Giá trị cột secret_key đã ở dạng mã hoá chưa. */
export function isSealedSecret(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

function aad(deviceUid: string): Buffer {
  return Buffer.from(`device-secret|${deviceUid}`, "utf8");
}

/** Mã hoá secret của thiết bị `deviceUid` bằng khoá 32 byte. */
export function sealSecret(key: Buffer, deviceUid: string, secret: string): string {
  if (key.length !== SECRET_KEY_BYTES) throw new Error("device secret key must be 32 bytes");
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(deviceUid));
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${body.toString("base64url")}.${tag.toString("base64url")}`;
}

/**
 * Secret dùng được để ký/kiểm HMAC:
 *   - bản rõ cũ → trả nguyên văn;
 *   - bản mã + đúng khoá + đúng thiết bị → bản rõ;
 *   - bản mã mà thiếu khoá / sai khoá / bị sửa / chép từ thiết bị khác → null (người gọi coi như không có secret).
 */
export function openSecret(key: Buffer | null, deviceUid: string, stored: string): string | null {
  if (!isSealedSecret(stored)) return stored;
  if (!key || key.length !== SECRET_KEY_BYTES) return null;
  const parts = stored.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, body, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(deviceUid));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
