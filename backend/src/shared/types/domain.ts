// Kiểu nguyên thuỷ dùng chung của domain Smart Home V2 (CONTRACT_V2 §3).
// Đặt ở một chỗ để module nào cũng import cùng định nghĩa — tránh mỗi module
// tự khai báo union riêng rồi lệch nhau khi contract đổi.

export type SystemRole = "admin" | "operator" | "user";
export type StaffRole = "admin" | "operator";

export type HomeStatus = "unclaimed" | "active" | "suspended";
export type PackageCode = "KIT_A" | "KIT_B";
export type MemberRole = "OWNER" | "CONTROLLER" | "VIEWER" | "GUEST";

export type DeviceCategory = "gateway" | "sensor" | "relay" | "camera" | "door_contact";
// Trạng thái quản trị của thiết bị (cột devices.status) — khác "online" (suy từ last_seen)
export type DeviceStatus = "inactive" | "active" | "blocked";

export type Severity = "critical" | "warning" | "info" | "success";

// Mảng hằng để whitelist khi validate input (validate.requireEnum)
export const SYSTEM_ROLES: readonly SystemRole[] = ["admin", "operator", "user"];
export const STAFF_ROLES: readonly StaffRole[] = ["admin", "operator"];
export const HOME_STATUSES: readonly HomeStatus[] = ["unclaimed", "active", "suspended"];
export const PACKAGE_CODES: readonly PackageCode[] = ["KIT_A", "KIT_B"];
export const MEMBER_ROLES: readonly MemberRole[] = ["OWNER", "CONTROLLER", "VIEWER", "GUEST"];
export const DEVICE_CATEGORIES: readonly DeviceCategory[] = ["gateway", "sensor", "relay", "camera", "door_contact"];
export const DEVICE_STATUSES: readonly DeviceStatus[] = ["inactive", "active", "blocked"];
export const SEVERITIES: readonly Severity[] = ["critical", "warning", "info", "success"];

/** Kênh mount: mobile = /api/mobile (Bearer), web = /api/portal (cookie sh_user). */
export type CustomerChannel = "mobile" | "web";
