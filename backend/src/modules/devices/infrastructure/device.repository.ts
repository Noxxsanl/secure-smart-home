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

/** Nhiệt độ đặt của điều hoà sau khi thiết bị ack lệnh set_temp (CHECK 16..30 ở DB). */
export async function updateAcSetpoint(deviceDbId: number, setpoint: number, db: Queryable = pool): Promise<void> {
  await runSql("UPDATE devices SET ac_setpoint = ? WHERE id = ?", [setpoint, deviceDbId], db);
}

/** Bật thêm bit mã IR đã học: ac_codes = COALESCE(ac_codes, 0) | mask (một câu nguyên tử, NULL coi như 0). */
export async function orAcCodes(deviceDbId: number, mask: number, db: Queryable = pool): Promise<void> {
  await runSql("UPDATE devices SET ac_codes = COALESCE(ac_codes, 0) | ? WHERE id = ?", [mask, deviceDbId], db);
}

export interface NodeApplianceRow {
  id: number;
  appliance: string;
  power_state: boolean | null;
  ac_setpoint: number | null;
  ac_codes: number | null;
  last_seen: Date | null;
}

/**
 * Các thiết bị THẬT (is_simulated = FALSE) gắn với một Node: cùng nhà và device_id = "<node_uid>-<appliance>"
 * (quy ước của scripts/register-hardware.ts). Node là chủ của chúng nên telemetry của Node cũng là bằng chứng
 * "còn sống" của các relay này (chúng không tự gửi gì lên backend).
 */
export async function listNodeAppliances(nodeDbId: number, db: Queryable = pool): Promise<NodeApplianceRow[]> {
  return queryRows<NodeApplianceRow>(
    `SELECT a.id, a.appliance, a.power_state, a.ac_setpoint, a.ac_codes, a.last_seen
       FROM devices n
       JOIN devices a ON a.home_id = n.home_id
                     AND a.is_simulated = FALSE
                     AND a.appliance IS NOT NULL
                     AND a.device_id = n.device_id || '-' || a.appliance
      WHERE n.id = ? AND n.home_id IS NOT NULL
      ORDER BY a.id`,
    [nodeDbId],
    db
  );
}

/** last_seen = NOW() cho một relay của Node, ghi kèm power_state/ac_setpoint/ac_codes (giữ nguyên giá trị cũ nếu truyền lại). */
export async function touchAppliance(
  deviceDbId: number,
  power: boolean | null,
  setpoint: number | null,
  acCodes: number | null,
  db: Queryable = pool
): Promise<void> {
  await runSql(
    "UPDATE devices SET last_seen = NOW(), power_state = ?, ac_setpoint = ?, ac_codes = ? WHERE id = ?",
    [power, setpoint, acCodes, deviceDbId],
    db
  );
}
