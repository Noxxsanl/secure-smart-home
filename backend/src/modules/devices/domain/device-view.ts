// Dựng CustomerDevice[] theo quyền của người gọi — dùng chung cho overview, phòng, thiết bị.
// GUEST chỉ thấy thiết bị được cấp (canViewDevice); can_control tính theo vai trò (canControlDevice).
import { canControlDevice, canViewDevice } from "../../homes";
import type { HomeAccess } from "../../homes";
import { latestReadings, toCustomerDevice } from "../infrastructure/device.read-model";
import type { CustomerDevice, DeviceRow } from "./device.types";

/** Chỉ cảm biến và cảm biến cửa có số đo; relay/camera không gọi sensor_data. */
const READING_CATEGORIES = new Set(["sensor", "door_contact"]);

export async function toCustomerDevices(rows: readonly DeviceRow[], access: HomeAccess): Promise<CustomerDevice[]> {
  const visible = rows.filter((row) => row.device_type !== "gateway" && row.home_id !== null && canViewDevice(access, row.id));
  const readings = await latestReadings(visible.filter((row) => READING_CATEGORIES.has(row.category)).map((row) => row.id));
  return visible.map((row) =>
    toCustomerDevice(row, { canControl: canControlDevice(access, row), latest: readings.get(row.id) ?? null })
  );
}

export async function toCustomerDeviceOne(row: DeviceRow, access: HomeAccess): Promise<CustomerDevice> {
  const [device] = await toCustomerDevices([row], access);
  return device;
}
