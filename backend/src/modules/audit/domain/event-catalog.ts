// Danh mục sự kiện → category/severity của Log Center (CONTRACT_V2 §1.3, FR-10.4).
// MỘT nguồn duy nhất cho: logEvent(), log() cũ (infrastructure/legacy-audit-logger.ts), và câu UPDATE backfill
// các dòng audit_log cũ trong migration — để 3 nơi không bao giờ lệch nhau.
import type { Severity } from "../../../shared/types/domain";

export type LogCategory =
  | "gateway"
  | "device"
  | "provision"
  | "mqtt"
  | "security"
  | "auth"
  | "activity"
  | "automation"
  | "ota"
  | "error";

export const LOG_CATEGORIES: readonly LogCategory[] = [
  "gateway",
  "device",
  "provision",
  "mqtt",
  "security",
  "auth",
  "activity",
  "automation",
  "ota",
  "error",
];

export function isLogCategory(value: string): value is LogCategory {
  return (LOG_CATEGORIES as readonly string[]).includes(value);
}

export interface EventMeta {
  category: LogCategory;
  severity: Severity;
}

/** [event_type, category, severity] — đúng bảng §1.3, thêm vài sự kiện nội bộ (ghi chú bên phải). */
export const EVENT_CATALOG_ENTRIES: ReadonlyArray<readonly [string, LogCategory, Severity]> = [
  // security
  ["GATEWAY_AUTH_FAIL", "security", "warning"],
  ["SENSOR_AUTH_FAIL", "security", "warning"],
  ["REPLAY_ATTACK", "security", "warning"],
  ["PRIVILEGE_ESCALATION", "security", "warning"],
  ["CLAIM_RATE_LIMITED", "security", "warning"],
  ["REFRESH_TOKEN_REUSED", "security", "critical"],
  ["LOGIN_WRONG_CHANNEL", "security", "warning"],
  ["DEVICE_BLOCKED", "security", "critical"],
  // mqtt
  ["DATA_RECV", "mqtt", "info"],
  ["MQTT_CONNECTED", "mqtt", "info"],
  ["MQTT_DISCONNECTED", "mqtt", "warning"],
  // device
  ["DEVICE_REGISTER", "device", "info"],
  ["DEVICE_STATUS_CHANGE", "device", "info"],
  ["DEVICE_DELETE", "device", "warning"],
  ["DEVICE_ASSIGNED", "device", "info"],
  ["DEVICE_COMMAND", "device", "info"],
  ["DEVICE_COMMAND_FAILED", "device", "warning"],
  ["DEVICE_RENAMED", "device", "info"],
  ["DEVICE_ONLINE", "device", "info"],
  ["DEVICE_OFFLINE", "device", "warning"],
  // gateway
  ["GATEWAY_ONLINE", "gateway", "success"],
  ["GATEWAY_OFFLINE", "gateway", "critical"],
  ["GATEWAY_RESTART", "gateway", "info"],
  ["GATEWAY_FACTORY_RESET", "gateway", "warning"],
  // provision
  ["HOME_CREATED", "provision", "info"],
  ["ACTIVATION_CODE_CREATED", "provision", "info"],
  ["ACTIVATION_CODE_REVOKED", "provision", "warning"],
  ["ACTIVATION_SUCCESS", "provision", "success"],
  ["ACTIVATION_FAILED", "provision", "warning"],
  ["OWNER_ASSIGNED", "provision", "success"],
  ["HOME_STATUS_CHANGED", "provision", "warning"], // thêm: ADMIN tạm ngưng / mở lại nhà
  // auth
  ["LOGIN_SUCCESS", "auth", "info"],
  ["LOGIN_FAILED", "auth", "warning"],
  ["LOGOUT", "auth", "info"],
  ["REGISTER", "auth", "info"],
  ["PASSWORD_CHANGED", "auth", "info"],
  ["ACCOUNT_LOCKED", "auth", "warning"],
  // activity
  ["MEMBER_INVITED", "activity", "info"],
  ["MEMBER_JOINED", "activity", "info"],
  ["MEMBER_ROLE_CHANGED", "activity", "info"],
  ["MEMBER_REMOVED", "activity", "info"],
  ["MEMBER_LEFT", "activity", "info"],
  ["INVITE_DECLINED", "activity", "info"],
  ["HOME_RENAMED", "activity", "info"],
  ["ROOM_RENAMED", "activity", "info"],
  ["OPERATOR_ACCESS_GRANTED", "activity", "warning"],
  ["OPERATOR_ACCESS_REVOKED", "activity", "info"],
  ["OPERATOR_HOME_VIEWED", "activity", "info"],
  ["STAFF_CREATED", "activity", "info"],
  ["STAFF_UPDATED", "activity", "info"],
  ["STAFF_DELETED", "activity", "info"],
  ["LOGS_DELETED", "activity", "warning"],
  // automation
  ["AUTOMATION_CREATED", "automation", "info"],
  ["AUTOMATION_UPDATED", "automation", "info"],
  ["AUTOMATION_DELETED", "automation", "info"],
  ["AUTOMATION_TRIGGERED", "automation", "success"],
  ["AUTOMATION_FAILED", "automation", "warning"],
  ["SUGGESTION_CREATED", "automation", "info"],
  ["SUGGESTION_ACCEPTED", "automation", "info"],
  ["SUGGESTION_DISMISSED", "automation", "info"],
  // ota
  ["FIRMWARE_UPLOADED", "ota", "info"],
  ["OTA_DEPLOYED", "ota", "info"],
  ["OTA_PROGRESS", "ota", "info"],
  ["OTA_COMPLETED", "ota", "success"],
  ["OTA_ROLLED_BACK", "ota", "warning"],
  // error
  ["UNHANDLED_ERROR", "error", "critical"], // thêm: lỗi không bắt được ở error middleware
];

/** Mặc định cho mọi event_type chưa khai báo: lỗi nghiêm trọng (§1.3 "anything else"). */
export const FALLBACK_EVENT_META: EventMeta = { category: "error", severity: "critical" };

const CATALOG = new Map<string, EventMeta>(
  EVENT_CATALOG_ENTRIES.map(([eventType, category, severity]) => [eventType, { category, severity }] as const)
);

/** category/severity mặc định của một event_type. */
export function resolveEventMeta(eventType: string): EventMeta {
  return CATALOG.get(eventType) ?? FALLBACK_EVENT_META;
}
