// Truy cập thiết bị của KHÁCH HÀNG: gộp "thiết bị có tồn tại không" + "người dùng có quyền với nhà
// chứa nó không" + "GUEST có được phép thiết bị này không" thành một lời gọi, để mọi endpoint
// /devices/:deviceId/** (BE-B) cùng áp quy tắc 404/403 (invariant 6).
import { notFound } from "../../lib/http";
import type { HomeAccess, Permission } from "../access/access.types";
import { requireHomeMember } from "../access/access.service";
import { canViewDevice } from "../access/permissions";
import type { AuthContext } from "../auth/auth.types";
import { getDeviceRow } from "./deviceReadModel";
import type { DeviceRow } from "./devices.types";

/**
 * Trả { device, access } nếu `auth` được phép với thiết bị. Ném:
 *   404 NOT_FOUND  thiết bị không tồn tại / chưa gán nhà / là gateway / nhà không thuộc quyền /
 *                  GUEST không được phép thiết bị này (không lộ sự tồn tại)
 *   403 FORBIDDEN  là thành viên nhưng vai trò thiếu `permission`
 * Với quyền điều khiển: gọi `requireDeviceAccess(auth, id, "control_device")` rồi sendDeviceCommand().
 */
export async function requireDeviceAccess(
  auth: AuthContext,
  deviceId: number,
  permission?: Permission
): Promise<{ device: DeviceRow; access: HomeAccess }> {
  const device = await getDeviceRow(deviceId);
  if (!device || device.home_id === null || device.device_type === "gateway") throw notFound("Device not found");
  const access = await requireHomeMember(auth, device.home_id, permission);
  if (!canViewDevice(access, device.id)) throw notFound("Device not found");
  return { device, access };
}
