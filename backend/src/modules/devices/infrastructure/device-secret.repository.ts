// Chỗ DUY NHẤT của backend SELECT cột devices.secret_key (invariant 1; insertDevice ở device-provisioning
// chỉ GHI cột này). Giá trị đọc ra chỉ dùng để ký/kiểm HMAC trong RAM — không bao giờ log, không trả ra API
// (invariant 2). Module khác ký/kiểm bằng secret gateway qua getGatewaySigner (domain/gateway-signer.ts), không nhận secret.
import pool from "../../../infrastructure/database/pool";
import { queryOne, queryRows, type Queryable } from "../../../infrastructure/database/db";

export interface DeviceAuthRow {
  id: number;
  secret_key: string;
  status: "inactive" | "active" | "blocked";
  fail_count: number;
}

/**
 * Thiết bị theo UID để kiểm HMAC. device_id so khớp CHÍNH XÁC (PostgreSQL phân biệt hoa/thường): HMAC được tính
 * trên đúng chuỗi thiết bị gửi, nên id sai hoa/thường phải là NOT_FOUND chứ không được khớp nhầm thiết bị khác.
 */
export async function fetchDeviceForAuth(deviceUid: string, db: Queryable = pool): Promise<DeviceAuthRow | null> {
  return queryOne<DeviceAuthRow>(
    `SELECT id, secret_key, status, fail_count FROM devices WHERE device_id = ? LIMIT 1`,
    [deviceUid],
    db
  );
}

/** secret_key của GATEWAY (devices.id) — chỉ để ký lệnh/OTA tới gateway và kiểm HMAC ack. */
export async function loadGatewaySecret(gatewayDbId: number, db: Queryable = pool): Promise<string | null> {
  const row = await queryOne<{ secret_key: string }>(
    "SELECT secret_key FROM devices WHERE id = ? AND device_type = 'gateway'",
    [gatewayDbId],
    db
  );
  return row?.secret_key ?? null;
}

/**
 * Sensor active mà gateway được phép nhận secret: node của CHÍNH gateway đó cộng sensor cũ chưa gán gateway
 * (gateway_device_id IS NULL). Chỉ phục vụ GET /api/device/sensors sau khi đã kiểm Gateway HMAC.
 */
export async function listActiveSensorSecrets(gatewayDbId: number | null, db: Queryable = pool): Promise<{ device_id: string; secret_key: string }[]> {
  return queryRows<{ device_id: string; secret_key: string }>(
    `SELECT device_id, secret_key FROM devices
     WHERE device_type = 'sensor' AND status = 'active'
       AND (gateway_device_id IS NULL OR gateway_device_id = ?)`,
    [gatewayDbId],
    db
  );
}
