// Đổi tên thiết bị phía khách (CONTRACT §4.2). Quyền "rename" (404/403 theo requireDeviceAccess); nhà suspended → 409.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { eventBus } from "../../../../shared/events/event-bus";
import { notFound } from "../../../../shared/errors/http-error";
import { assertHomeWritable } from "../../../homes";
import { logEvent } from "../../../audit";
import { requireDeviceAccess } from "../../domain/device-access";
import { toCustomerDeviceOne } from "../../domain/device-view";
import type { CustomerDevice } from "../../domain/device.types";
import { updateDeviceName } from "../../infrastructure/device.repository";
import { getDeviceRow } from "../../infrastructure/device.read-model";

export async function renameDevice(auth: AuthContext, deviceId: number, name: string, meta: RequestMeta): Promise<CustomerDevice> {
  const { device, access } = await requireDeviceAccess(auth, deviceId, "rename");
  assertHomeWritable(access.home);
  await updateDeviceName(device.id, name);
  await logEvent({
    eventType: "DEVICE_RENAMED",
    homeId: device.home_id,
    deviceId: device.id,
    actorUserId: auth.userId,
    message: `${auth.displayName} đổi tên thiết bị "${device.device_name}" thành "${name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  if (device.home_id !== null) eventBus.emit("home_changed", { home_id: device.home_id });
  const fresh = await getDeviceRow(device.id);
  if (!fresh) throw notFound("Device not found");
  return toCustomerDeviceOne(fresh, access);
}
