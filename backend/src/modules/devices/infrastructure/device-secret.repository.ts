// Chỗ DUY NHẤT của backend đọc cột devices.secret_key (invariant 1). Cột lưu bản mã AES-256-GCM khi có
// DEVICE_SECRET_KEY (FR-12.8, domain/secret-box.ts); hàm đọc ở đây trả secret ĐÃ MỞ để ký/kiểm HMAC trong RAM — không
// bao giờ log, không trả ra API (invariant 2). Module khác ký/kiểm bằng secret gateway qua getGatewaySigner
// (domain/gateway-signer.ts), không nhận secret. Mọi chỗ GHI secret gọi sealForStorage() trước khi INSERT/UPDATE.
import { env } from "../../../config/env";
import pool from "../../../infrastructure/database/pool";
import { queryOne, queryRows, runSql, type Queryable } from "../../../infrastructure/database/db";
import { isSealedSecret, openSecret, sealSecret } from "../domain/secret-box";

export interface DeviceAuthRow {
  id: number;
  /** Secret đã mở; null khi cột là bản mã mà thiếu/sai DEVICE_SECRET_KEY (không ký/kiểm được). */
  secret_key: string | null;
  status: "inactive" | "active" | "blocked";
  fail_count: number;
  device_type: "sensor" | "gateway";
  /** Gateway cha (devices.id) của sensor; NULL với gateway và sensor chưa gắn gateway. */
  gateway_device_id: number | null;
}

let missingKeyLogged = false;

function open(deviceUid: string, stored: string): string | null {
  const secret = openSecret(env.deviceSecretKey, deviceUid, stored);
  if (secret === null && !missingKeyLogged) {
    missingKeyLogged = true; // chỉ log 1 lần — mọi thiết bị đều lỗi như nhau khi thiếu khoá
    console.error(
      "[devices] secret_key is encrypted but DEVICE_SECRET_KEY is missing or wrong – devices cannot authenticate"
    );
  }
  return secret;
}

/** Giá trị đưa vào cột secret_key: bản mã nếu đã cấu hình khoá, ngược lại bản rõ (dev). */
export function sealForStorage(deviceUid: string, secret: string): string {
  return env.deviceSecretKey ? sealSecret(env.deviceSecretKey, deviceUid, secret) : secret;
}

/**
 * Thiết bị theo UID để kiểm HMAC. device_id so khớp CHÍNH XÁC (PostgreSQL phân biệt hoa/thường): HMAC được tính
 * trên đúng chuỗi thiết bị gửi, nên id sai hoa/thường phải là NOT_FOUND chứ không được khớp nhầm thiết bị khác.
 */
export async function fetchDeviceForAuth(deviceUid: string, db: Queryable = pool): Promise<DeviceAuthRow | null> {
  const row = await queryOne<Omit<DeviceAuthRow, "secret_key"> & { secret_key: string }>(
    `SELECT id, secret_key, status, fail_count, device_type, gateway_device_id FROM devices WHERE device_id = ? LIMIT 1`,
    [deviceUid],
    db
  );
  if (!row) return null;
  return { ...row, secret_key: open(deviceUid, row.secret_key) };
}

/** secret_key (đã mở) của GATEWAY (devices.id) — chỉ để ký lệnh/OTA tới gateway và kiểm HMAC ack/heartbeat/ảnh. */
export async function loadGatewaySecret(gatewayDbId: number, db: Queryable = pool): Promise<string | null> {
  const row = await queryOne<{ device_id: string; secret_key: string }>(
    "SELECT device_id, secret_key FROM devices WHERE id = ? AND device_type = 'gateway'",
    [gatewayDbId],
    db
  );
  return row ? open(row.device_id, row.secret_key) : null;
}

// ── Chuyển dữ liệu cũ sang dạng mã hoá (worker seal-secrets) ────────────────

/** Tối đa `limit` dòng còn lưu secret dạng rõ. */
export async function listPlaintextSecrets(
  limit: number,
  db: Queryable = pool
): Promise<{ id: number; device_id: string; secret_key: string }[]> {
  const rows = await queryRows<{ id: number; device_id: string; secret_key: string }>(
    "SELECT id, device_id, secret_key FROM devices WHERE secret_key NOT LIKE 'enc1:%' ORDER BY id LIMIT ?",
    [limit],
    db
  );
  return rows.filter((row) => !isSealedSecret(row.secret_key));
}

/**
 * Thay bản rõ bằng bản mã — chỉ khi cột vẫn đúng giá trị vừa đọc (không đè secret vừa được đăng ký lại song song).
 * true nếu đã ghi.
 */
export async function replacePlaintextSecret(
  id: number,
  plaintext: string,
  sealed: string,
  db: Queryable = pool
): Promise<boolean> {
  const result = await runSql("UPDATE devices SET secret_key = ? WHERE id = ? AND secret_key = ?", [sealed, id, plaintext], db);
  return result.affectedRows === 1;
}
