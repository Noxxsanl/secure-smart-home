// Ghi thiết bị mới của KIT (bảng devices thuộc module devices). Module homes gọi qua index khi tạo nhà KIT,
// truyền `db` = kết nối transaction của nó (invariant 9: tạo nhà + phòng + thiết bị trong 1 transaction).
import { runSql, type Queryable } from "../../../infrastructure/database/db";
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
