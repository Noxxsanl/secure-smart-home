// Cảm biến cửa ảo: đẩy một số đo { door_open } qua đúng hook như thiết bị thật
// (mở cửa → thông báo DOOR_OPENED cho thành viên nhà).
import { HttpError } from "../../../../shared/errors/http-error";
import type { DeviceRow } from "../../../devices";
import { ingestSimulatedReading } from "../../domain/simulated-reading";

/** Phải là cảm biến cửa ảo có gateway và đang bật nguồn; trả về id gateway. */
export function assertSimulatedDoorSensor(device: DeviceRow): number {
  if (device.category !== "door_contact") throw new HttpError(409, "NOT_SIMULATED", "Device is not a simulated door sensor");
  if (device.gateway_device_id === null) throw new HttpError(409, "NO_GATEWAY", "Device has no gateway");
  if (!device.sim_online) throw new HttpError(409, "DEVICE_OFFLINE", "Simulated device is powered off");
  return device.gateway_device_id;
}

export async function simulateDoor(sensorId: number, gatewayId: number, open: boolean): Promise<void> {
  await ingestSimulatedReading(sensorId, gatewayId, { door_open: open });
}
