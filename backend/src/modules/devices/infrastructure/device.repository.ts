// SQL trạng thái chạy của bảng devices: last_seen / fail_count / last_ip / power_state / provision_status / status
// và đổi tên. Module telemetry và control không được tự UPDATE bảng này (quy tắc T1) nên gọi các hàm dưới qua
// devices.facade — cùng một câu SQL cho cả đường ingest HTTP lẫn MQTT (invariant 4).
// Mọi hàm ghi nhận `db` để chạy được trong transaction của người gọi.
import pool from "../../../infrastructure/database/pool";
import { placeholders, queryOne, queryRows, runSql, type Queryable } from "../../../infrastructure/database/db";

export async function updateDeviceName(id: number, name: string, db: Queryable = pool): Promise<void> {
  await runSql("UPDATE devices SET device_name = ? WHERE id = ?", [name, id], db);
}

/** (id, last_seen) của mọi thiết bị — nguyên liệu của presence monitor. */
export async function listDeviceLastSeen(db: Queryable = pool): Promise<{ id: number; last_seen: Date | null }[]> {
  return queryRows<{ id: number; last_seen: Date | null }>("SELECT id, last_seen FROM devices", [], db);
}

/** Cập nhật IP thiết bị theo UID (devices.device_id) khi broker báo client mới kết nối. */
export async function updateDeviceIpByUid(deviceUid: string, ip: string, db: Queryable = pool): Promise<void> {
  await runSql("UPDATE devices SET last_ip = ? WHERE device_id = ?", [ip, deviceUid], db);
}

export interface DeviceTypeStatus {
  id: number;
  device_type: string;
  status: string;
}

/** device_type + status hiện tại của gateway và sensor (một lượt) — kiểm RBAC loại thiết bị trước khi nhận số đo. */
export async function listGatewayAndSensorTypeStatus(gatewayId: number, sensorId: number, db: Queryable = pool): Promise<DeviceTypeStatus[]> {
  return queryRows<DeviceTypeStatus>(
    `SELECT id, device_type, status FROM devices WHERE id IN (?, ?)`,
    [gatewayId, sensorId],
    db
  );
}

/**
 * Đánh dấu vừa nhận số đo hợp lệ: last_seen = NOW(), fail_count = 0. `ip` khác null (kể cả chuỗi rỗng) → ghi
 * thêm last_ip; null → giữ IP cũ.
 */
export async function markDeviceSeen(deviceDbId: number, ip: string | null, db: Queryable = pool): Promise<void> {
  if (ip !== null) {
    await runSql(`UPDATE devices SET last_seen = NOW(), fail_count = 0, last_ip = ? WHERE id = ?`, [ip, deviceDbId], db);
  } else {
    await runSql(`UPDATE devices SET last_seen = NOW(), fail_count = 0 WHERE id = ?`, [deviceDbId], db);
  }
}

/**
 * Tăng fail_count sau một lần xác thực HMAC thất bại, trả giá trị mới.
 * LEAST(…, 1000): fail_count là SMALLINT; thiết bị đã blocked vẫn bị đếm tiếp nên không chặn trần sẽ tràn
 * 32767 → lỗi 22003 → 500.
 */
export async function incrementFailCount(deviceDbId: number, db: Queryable = pool): Promise<number> {
  await runSql(`UPDATE devices SET fail_count = LEAST(fail_count + 1, 1000) WHERE id = ?`, [deviceDbId], db);
  const row = await queryOne<{ fail_count: number }>(`SELECT fail_count FROM devices WHERE id = ?`, [deviceDbId], db);
  return row?.fail_count ?? 0;
}

export async function blockDevice(deviceDbId: number, db: Queryable = pool): Promise<void> {
  await runSql(`UPDATE devices SET status = 'blocked' WHERE id = ?`, [deviceDbId], db);
}

/** provision_status 'pending' → 'provisioned' cho các thiết bị lần đầu được thấy (điều kiện lặp lại trong SQL để chống race). */
export async function markProvisioned(deviceIds: readonly number[], db: Queryable = pool): Promise<void> {
  if (deviceIds.length === 0) return;
  await runSql(
    `UPDATE devices SET provision_status = 'provisioned'
      WHERE id IN (${placeholders(deviceIds.length)}) AND provision_status = 'pending'`,
    [...deviceIds],
    db
  );
}

/** Trạng thái relay sau khi thiết bị ack lệnh. */
export async function updatePowerState(deviceDbId: number, power: boolean, db: Queryable = pool): Promise<void> {
  await runSql("UPDATE devices SET power_state = ? WHERE id = ?", [power, deviceDbId], db);
}
