// Ma trận quyền theo vai trò trong nhà (CONTRACT_V2 §4.1) và các hàm kiểm tra thuần (không DB).
// Backend là nơi cưỡng chế; client chỉ phản chiếu ma trận này để ẩn/hiện nút.
import { HttpError, forbidden } from "../../lib/http";
import type { MemberRole } from "../../types/domain";
import type { DeviceRow } from "../devices/devices.types";
import type { HomeRow } from "../homes/homes.types";
import type { HomeAccess, Permission } from "./access.types";

export const ROLE_PERMISSIONS: Readonly<Record<MemberRole, readonly Permission[]>> = {
  OWNER: ["view", "control_device", "rename", "view_automation", "create_automation", "manage_any_rule", "manage_members"],
  CONTROLLER: ["view", "control_device", "rename", "view_automation", "create_automation", "leave"],
  VIEWER: ["view", "view_automation", "leave"],
  // GUEST điều khiển được nhưng chỉ trên thiết bị trong member_device_access (xem canControlDevice)
  GUEST: ["view", "control_device", "leave"],
};

export function roleHasPermission(role: MemberRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasPermission(access: Pick<HomeAccess, "permissions">, permission: Permission): boolean {
  return access.permissions.includes(permission);
}

/** Thiếu quyền → 403 FORBIDDEN (người gọi đã là thành viên nên nhà "tồn tại" với họ — invariant 6). */
export function assertPermission(access: Pick<HomeAccess, "permissions">, permission: Permission): void {
  if (!hasPermission(access, permission)) throw forbidden(`Missing permission: ${permission}`);
}

/** Nhà bị tạm ngưng vẫn đọc được nhưng không cho ghi/điều khiển → 409 HOME_SUSPENDED. */
export function assertHomeWritable(home: Pick<HomeRow, "status">): void {
  if (home.status === "suspended") throw new HttpError(409, "HOME_SUSPENDED", "Home is suspended");
}

/** GUEST chỉ thấy thiết bị trong danh sách được phép; vai trò khác thấy tất cả. */
export function canViewDevice(access: Pick<HomeAccess, "guestDeviceIds">, deviceId: number): boolean {
  return access.guestDeviceIds === null || access.guestDeviceIds.includes(deviceId);
}

/**
 * `can_control` của CustomerDevice: relay && vai trò có control_device && (GUEST: thiết bị được phép).
 * Không phụ thuộc online (CONTRACT §3).
 */
export function canControlDevice(access: Pick<HomeAccess, "permissions" | "guestDeviceIds">, device: Pick<DeviceRow, "id" | "category">): boolean {
  return device.category === "relay" && hasPermission(access, "control_device") && canViewDevice(access, device.id);
}

/** Sửa/bật-tắt/xoá rule: OWNER mọi rule; CONTROLLER chỉ rule do chính mình tạo; còn lại không. */
export function canEditRule(access: Pick<HomeAccess, "permissions">, ruleCreatedByUserId: number | null, userId: number): boolean {
  if (hasPermission(access, "manage_any_rule")) return true;
  return hasPermission(access, "create_automation") && ruleCreatedByUserId !== null && ruleCreatedByUserId === userId;
}
