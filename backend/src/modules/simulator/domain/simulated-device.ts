// Policy chọn thiết bị ảo cho route power/door: phải tồn tại, là thiết bị is_simulated và simulator đang bật.
import { env } from "../../../config/env";
import { HttpError, notFound } from "../../../shared/errors/http-error";
import { parseIdParam } from "../../../shared/validation/validate";
import { getDeviceRow } from "../../devices";
import type { DeviceRow } from "../../devices";

export async function loadSimulatedDevice(rawId: unknown): Promise<DeviceRow> {
  const device = await getDeviceRow(parseIdParam(rawId));
  if (!device) throw notFound("Device not found");
  if (!device.is_simulated) throw new HttpError(409, "NOT_SIMULATED", "Device is not simulated");
  if (!env.deviceSimulator) throw new HttpError(409, "SIMULATOR_DISABLED", "Device simulator is disabled");
  return device;
}
