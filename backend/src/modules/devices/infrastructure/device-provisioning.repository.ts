// Ghi thiết bị mới của KIT và đăng ký phần cứng thật (bảng devices thuộc module devices). Module homes gọi qua index
// khi tạo nhà KIT / đăng ký gateway, truyền `db` = kết nối transaction của nó (invariant 9: nhà + phòng + thiết bị
// trong 1 transaction).
import { placeholders, queryOne, queryRows, runSql, type Queryable } from "../../../infrastructure/database/db";
import type { Appliance } from "../domain/device.types";
import type { DeviceCategory } from "../../../shared/types/domain";

export interface NewDeviceRecord {
  uid: string;
  name: string;
  deviceType: "sensor" | "gateway";
  category: DeviceCategory;
  /** secret_key HMAC — chỉ ghi vào DB, không bao giờ trả về/log (invariant 1, 2). */
  secret: string;
  homeId: number;
  roomId: number | null;
  gatewayDeviceId: number | null;
  nodeUid: string | null;
  powerState: false | null;
  firmwareVersion: string;
  location: string | null;
  simulated: boolean;
  createdBy: number;
}

/** Thiết bị mới của KIT: status 'active' (đã được nhà máy cấp danh tính); simulated → coi như đã provision và online. */
export async function insertDevice(db: Queryable, device: NewDeviceRecord): Promise<number> {
  const result = await runSql(
    `INSERT INTO devices
       (device_id, device_name, device_type, secret_key, status, location, fail_count, created_by,
        home_id, room_id, gateway_device_id, node_uid, category, power_state, firmware_version,
        provision_status, is_simulated, sim_online, last_seen)
     VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)
     RETURNING id`,
    [
      device.uid,
      device.name,
      device.deviceType,
      device.secret,
      device.location,
      device.createdBy,
      device.homeId,
      device.roomId,
      device.gatewayDeviceId,
      device.nodeUid,
      device.category,
      device.powerState,
      device.firmwareVersion,
      device.simulated ? "provisioned" : "pending",
      device.simulated,
      device.simulated ? new Date() : null,
    ],
    db
  );
  return result.insertId;
}

// ── Đăng ký phần cứng thật (homes/features/register-gateway) ───────────────
// Cùng ngữ nghĩa với công cụ dev scripts/register-hardware.ts: upsert theo device_id, secret lấy từ NVS đã nạp vào chip.

/** Thiết bị đã có trong DB theo device_id — không có secret_key. */
export interface ExistingDeviceRef {
  id: number;
  device_id: string;
  category: string;
  home_id: number | null;
  room_id: number | null;
  status: string;
}

const EXISTING_REF_COLUMNS = "id, device_id, category, home_id, room_id, status";

/** Khoá (FOR UPDATE) các dòng đã có để kiểm tra "thuộc nhà nào" không bị đăng ký song song qua mặt. */
export async function findDevicesByUids(db: Queryable, uids: readonly string[]): Promise<ExistingDeviceRef[]> {
  if (uids.length === 0) return [];
  return queryRows<ExistingDeviceRef>(
    `SELECT ${EXISTING_REF_COLUMNS} FROM devices WHERE device_id IN (${placeholders(uids.length)}) ORDER BY id FOR UPDATE`,
    [...uids],
    db
  );
}

/** Mọi thiết bị đang nối qua các gateway này (node, camera, relay) — khoá FOR UPDATE. */
export async function findGatewayChildren(db: Queryable, gatewayIds: readonly number[]): Promise<ExistingDeviceRef[]> {
  if (gatewayIds.length === 0) return [];
  return queryRows<ExistingDeviceRef>(
    `SELECT ${EXISTING_REF_COLUMNS} FROM devices
      WHERE gateway_device_id IN (${placeholders(gatewayIds.length)}) ORDER BY id FOR UPDATE`,
    [...gatewayIds],
    db
  );
}

/**
 * Xoá các dòng thiết bị trước khi chuyển sang nhà khác: FK ON DELETE CASCADE dọn số đo, ảnh camera, lệnh, quyền
 * thiết bị của thành viên, lịch sử OTA… của chủ cũ — chủ mới không thấy dữ liệu cũ. Rule tự động hoá của nhà cũ trỏ
 * tới thiết bị bị đặt NULL (SET NULL), không điều khiển được thiết bị ở nhà mới.
 */
export async function deleteDevicesForTransfer(db: Queryable, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) return;
  await runSql(`DELETE FROM devices WHERE id IN (${placeholders(ids.length)})`, [...ids], db);
}

export interface HardwareDeviceRecord {
  uid: string;
  name: string;
  deviceType: "gateway" | "sensor";
  category: "gateway" | "sensor" | "camera";
  /** secret_key HMAC đã nạp vào chip — chỉ ghi vào DB, không bao giờ trả về/log (invariant 1, 2). */
  secret: string;
  homeId: number;
  roomId: number | null;
  location: string | null;
  gatewayDeviceId: number | null;
  createdBy: number;
}

/**
 * Gateway / node cảm biến / camera thật. Mới: provision_status 'pending' (thành 'provisioned' khi nhận số đo/heartbeat
 * đầu tiên). Đã có: giữ tên khách đã đặt, ghi đè secret theo NVS, gắn lại nhà/phòng/gateway, mở khoá
 * (status 'active', fail_count 0) và bỏ chế độ mô phỏng.
 * Chỉ ghi đè dòng chưa thuộc nhà nào hoặc đã thuộc đúng nhà này; dòng của NHÀ KHÁC (vd. một lượt đăng ký song song vừa
 * commit) → trả null để người gọi báo 409, không lặng lẽ chuyển thiết bị.
 */
export async function upsertHardwareDevice(
  db: Queryable,
  device: HardwareDeviceRecord
): Promise<{ id: number; device_name: string } | null> {
  const row = await queryOne<{ id: number; device_name: string }>(
    `INSERT INTO devices
       (device_id, device_name, device_type, secret_key, status, location, fail_count, created_by,
        home_id, room_id, gateway_device_id, category, provision_status, is_simulated)
     VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?, ?, ?, ?, 'pending', FALSE)
     ON CONFLICT (device_id) DO UPDATE SET
       device_type = EXCLUDED.device_type,
       category = EXCLUDED.category,
       secret_key = EXCLUDED.secret_key,
       location = EXCLUDED.location,
       home_id = EXCLUDED.home_id,
       room_id = EXCLUDED.room_id,
       gateway_device_id = EXCLUDED.gateway_device_id,
       status = 'active',
       fail_count = 0,
       is_simulated = FALSE
     WHERE devices.home_id IS NULL OR devices.home_id = EXCLUDED.home_id
     RETURNING id, device_name`,
    [
      device.uid,
      device.name,
      device.deviceType,
      device.secret,
      device.location,
      device.createdBy,
      device.homeId,
      device.roomId,
      device.gatewayDeviceId,
      device.category,
    ],
    db
  );
  return row;
}

export interface NodeApplianceRecord {
  /** "<device_id của node>-<appliance>". */
  uid: string;
  appliance: Appliance;
  name: string;
  /** true = relay mô phỏng (simulator ack); false = thiết bị thật (lệnh đi MQTT tới Node). */
  simulated: boolean;
  homeId: number;
  roomId: number;
  location: string;
  gatewayDeviceId: number;
  createdBy: number;
}

/**
 * Relay của Node phòng khách (đèn/quạt/rèm/điều hoà). Lần đầu: secret ngẫu nhiên do người gọi sinh (cột NOT NULL;
 * relay không tự ký — lệnh ký bằng secret gateway), power_state FALSE để UI có công tắc. Đã có: giữ secret, tên,
 * trạng thái bật/tắt, nhiệt độ đặt; chế độ mô phỏng chỉ đổi một chiều mô phỏng → thật. Dòng của nhà khác → null
 * (như upsertHardwareDevice).
 */
export async function upsertNodeAppliance(
  db: Queryable,
  device: NodeApplianceRecord & { secret: string }
): Promise<{ id: number; device_name: string; is_simulated: boolean } | null> {
  // Dòng thật (is_simulated FALSE) mới tạo có last_seen NULL = offline cho tới khi telemetry của Node cha tới
  const row = await queryOne<{ id: number; device_name: string; is_simulated: boolean }>(
    `INSERT INTO devices
       (device_id, device_name, device_type, secret_key, status, location, fail_count, created_by,
        home_id, room_id, gateway_device_id, category, appliance, power_state, provision_status, is_simulated, sim_online)
     VALUES (?, ?, 'sensor', ?, 'active', ?, 0, ?, ?, ?, ?, 'relay', ?, FALSE, 'provisioned', ?, TRUE)
     ON CONFLICT (device_id) DO UPDATE SET
       category = 'relay',
       appliance = EXCLUDED.appliance,
       is_simulated = CASE WHEN EXCLUDED.is_simulated = FALSE THEN FALSE ELSE devices.is_simulated END,
       location = EXCLUDED.location,
       home_id = EXCLUDED.home_id,
       room_id = EXCLUDED.room_id,
       gateway_device_id = EXCLUDED.gateway_device_id,
       power_state = COALESCE(devices.power_state, FALSE)
     WHERE devices.home_id IS NULL OR devices.home_id = EXCLUDED.home_id
     RETURNING id, device_name, is_simulated`,
    [
      device.uid,
      device.name,
      device.secret,
      device.location,
      device.createdBy,
      device.homeId,
      device.roomId,
      device.gatewayDeviceId,
      device.appliance,
      device.simulated,
    ],
    db
  );
  return row;
}
