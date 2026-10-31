import type {
  ActivationMethod, ActivationStatus, AutomationRule, DeviceCategory, DeviceCommandRecord, DeviceCommandStatus, HomeStatus, MemberRole, OtaDeploymentStatus, LogCategory, PackageCode, RoomType,
} from "./types";

// Nhãn tiếng Việt cho các giá trị enum của hợp đồng (thuật ngữ sản phẩm như
// Gateway, Relay, Camera, OTA giữ tiếng Anh). Đặt cạnh DTO vì nhiều module cùng
// hiển thị một enum (VD loại thiết bị ở Devices, Smart Homes, Settings).

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  gateway: "Gateway",
  sensor: "Cảm biến nhiệt/ẩm",
  relay: "Relay",
  camera: "Camera",
  door_contact: "Cảm biến cửa",
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  living_room: "Phòng khách",
  bedroom: "Phòng ngủ",
  kitchen: "Nhà bếp",
  bathroom: "Phòng tắm",
  office: "Phòng làm việc",
  garage: "Gara",
  garden: "Sân vườn",
  door: "Cửa",
};

export const HOME_STATUS_LABELS: Record<HomeStatus, string> = {
  unclaimed: "Chưa kích hoạt",
  active: "Đang hoạt động",
  suspended: "Tạm ngưng",
};

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: "Chủ nhà",
  CONTROLLER: "Điều khiển",
  VIEWER: "Chỉ xem",
  GUEST: "Khách",
};

export const ACTIVATION_STATUS_LABELS: Record<ActivationStatus, string> = {
  unused: "Chưa dùng",
  used: "Đã dùng",
  revoked: "Đã thu hồi",
  expired: "Hết hạn",
  none: "Chưa có mã",
};

export const ACTIVATION_METHOD_LABELS: Record<ActivationMethod, string> = {
  qr: "Quét QR",
  code: "Nhập mã",
  operator_assign: "Operator gán (User ID)",
};

/** Lý do claim thất bại (activation_logs.reason). */
export const ACTIVATION_REASON_LABELS: Record<string, string> = {
  NOT_FOUND: "Mã không tồn tại",
  ALREADY_USED: "Mã đã được dùng",
  EXPIRED: "Mã đã hết hạn",
  REVOKED: "Mã đã bị thu hồi",
  INVALID_QR: "QR không hợp lệ",
  RATE_LIMITED: "Bị chặn vì thử quá nhiều lần",
};

export const PACKAGE_LABELS: Record<PackageCode, string> = {
  KIT_A: "KIT_A — Gói cơ bản",
  KIT_B: "KIT_B — Gói mở rộng",
};

export const OTA_STATUS_LABELS: Record<OtaDeploymentStatus, string> = {
  in_progress: "Đang triển khai",
  completed: "Hoàn tất",
  rolled_back: "Đã rollback",
  failed: "Lỗi một phần",
};

export const COMMAND_LABELS: Record<string, string> = {
  turn_on: "Bật",
  turn_off: "Tắt",
  restart: "Khởi động lại",
  factory_reset: "Factory Reset",
};

export const COMMAND_STATUS_LABELS: Record<DeviceCommandStatus, string> = {
  pending: "Đang chờ",
  sent: "Đã gửi",
  acked: "Đã xác nhận",
  failed: "Thất bại",
  timeout: "Quá thời gian",
};

export const COMMAND_SOURCE_LABELS: Record<DeviceCommandRecord["source"], string> = {
  user: "Khách hàng",
  automation: "Automation",
  operator: "Nhân viên",
};

export const COMMAND_CHANNEL_LABELS: Record<DeviceCommandRecord["channel"], string> = {
  mobile: "Ứng dụng",
  web: "Cổng web",
  dashboard: "Dashboard",
  system: "Hệ thống",
};

const METRIC_LABELS: Record<NonNullable<AutomationRule["trigger_metric"]>, { label: string; unit: string }> = {
  temperature: { label: "Nhiệt độ", unit: "°C" },
  humidity: { label: "Độ ẩm", unit: "%" },
};

const WEEKDAY_SHORT = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Mô tả điều kiện của rule, VD "Phòng ngủ · Nhiệt độ > 30°C" hoặc "23:30 · Hằng ngày". */
export function describeTrigger(rule: AutomationRule): string {
  if (rule.trigger_type === "schedule") {
    const days = rule.schedule_days ?? [];
    const dayText = days.length === 7 || days.length === 0
      ? "Hằng ngày"
      : [...days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d] ?? `${d}`).join(", ");
    return `${rule.schedule_time ?? "--:--"} · ${dayText}`;
  }
  const metric = rule.trigger_metric ? METRIC_LABELS[rule.trigger_metric] : null;
  const room = rule.trigger_room_name ?? "Phòng đã xoá";
  if (!metric) return room;
  return `${room} · ${metric.label} ${rule.trigger_operator ?? ""} ${rule.trigger_threshold ?? "?"}${metric.unit}`;
}

/** Mô tả hành động của rule, VD "Bật Quạt phòng ngủ". */
export function describeAction(rule: AutomationRule): string {
  const verb = rule.action_command === "turn_on" ? "Bật" : "Tắt";
  return `${verb} ${rule.action_device_name ?? "thiết bị đã xoá"}`;
}

export const LOG_CATEGORY_LABELS: Record<LogCategory, string> = {
  gateway: "Gateway Log",
  device: "Device Log",
  provision: "Provision Log",
  mqtt: "MQTT Log",
  security: "Security Log",
  auth: "Authentication Log",
  activity: "User Activity Log",
  automation: "Automation Log",
  ota: "OTA Log",
  error: "Error Log",
};

/** Tên hiển thị của một loại log (VD "gateway" → "Gateway Log"). */
export function logCategoryLabel(category: LogCategory): string {
  return LOG_CATEGORY_LABELS[category] ?? "Log";
}
