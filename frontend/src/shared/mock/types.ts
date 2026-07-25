import type { ApiDevice, ApiUser, AppNotification } from "@/shared/types/api";

// ---------------------------------------------------------------------------
// Customer → Smart Home → Room → Gateway → Device → Telemetry domain types.
// These extend (not duplicate) the existing `shared/types/api.ts` shapes —
// `ApiDevice`/`ApiUser`/`AppNotification` stay the source of truth for the
// fields the backend already defines; everything here only adds what the
// new Information Architecture needs on top.
// ---------------------------------------------------------------------------

export type HomeStatus = "unclaimed" | "active" | "suspended";
export type PackageCode = "KIT_A" | "KIT_B";

export type Customer = {
  id: number;
  name: string;
  // Handle sinh ra khi khách hàng đăng ký tài khoản trên Mobile App (VD: "dat#4821") —
  // Operator dùng handle này để tra cứu và gán quyền sở hữu Smart Home trên Dashboard.
  user_tag: string;
  phone: string;
  email: string;
  address: string;
  joined_at: string;
  status: "active" | "inactive";
};

export type SmartHome = {
  id: number;
  name: string;
  address: string;
  package: PackageCode;
  status: HomeStatus;
  customer_id: number | null;
  gateway_id: number | null;
  activated_at: string | null;
  created_at: string;
};

export type RoomType =
  | "living_room" | "bedroom" | "kitchen" | "bathroom"
  | "office" | "garage" | "garden" | "door";

export type Room = {
  id: number;
  home_id: number;
  name: string;
  room_type: RoomType;
  temperature: number;
  humidity: number;
  power_usage: number;
  has_climate_data: boolean;
};

export type MemberRole = "OWNER" | "CONTROLLER" | "VIEWER" | "GUEST";

export type HomeMember = {
  id: number;
  home_id: number;
  name: string;
  initials: string;
  role: MemberRole;
  is_you?: boolean;
};

export type GatewayStatus = "online" | "offline";
export type MqttStatus = "connected" | "disconnected";
export type ProvisionStatus = "provisioned" | "pending";

export type Gateway = {
  id: number;
  home_id: number | null;
  uid: string;
  status: GatewayStatus;
  firmware_version: string;
  wifi_ssid: string;
  rssi: number;
  mqtt_status: MqttStatus;
  last_seen: string | null;
  provision_status: ProvisionStatus;
  node_count: number;
  paired_count: number;
};

// Device categories beyond the original sensor|gateway binary. Devices always
// belong to a Room (never standalone) per the new IA.
export type DeviceCategory = "sensor" | "relay" | "camera" | "door_contact";

export type MockDevice = ApiDevice & {
  home_id: number;
  room_id: number;
  category: DeviceCategory;
};

export type Camera = {
  id: number;
  home_id: number;
  room_id: number;
  name: string;
  status: "online" | "offline";
};

export type FirmwareType = "gateway" | "node";

export type FirmwareVersion = {
  id: number;
  type: FirmwareType;
  version: string;
  stable: boolean;
  released_at: string;
  file_name: string;
  size_kb: number;
};

export type OtaDeploymentStatus = "in_progress" | "completed" | "rolled_back";

export type OtaDeployment = {
  id: number;
  firmware_id: number;
  scope: "fleet" | "home";
  target_home_id: number | null;
  progress_percent: number;
  target_count: number;
  status: OtaDeploymentStatus;
  started_at: string;
};

export type AutomationRule = {
  id: number;
  home_id: number;
  name: string;
  enabled: boolean;
  trigger_room_id: number;
  trigger_metric: "temperature" | "humidity" | "power_usage";
  trigger_operator: ">" | "<" | "=";
  trigger_threshold: number;
  action_device_id: number;
  action_command: "turn_on" | "turn_off";
};

export type WarrantyRecord = {
  id: number;
  home_id: number;
  package: PackageCode;
  expires_at: string;
};

export type ActivationRecord = {
  id: number;
  customer_id: number;
  home_id: number;
  activated_at: string;
  result: "success" | "failed";
  // "qr"/"code": khách hàng tự claim trên Mobile App. "operator_assign": Operator
  // tra cứu user_tag và gán quyền sở hữu trực tiếp từ Dashboard.
  method: "qr" | "code" | "operator_assign";
};

export type OperatorAccessGrant = {
  id: number;
  operator_id: number;
  operator_username: string;
  home_id: number;
  reason: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type LogCategory =
  | "gateway" | "device" | "provision" | "mqtt" | "security"
  | "auth" | "activity" | "automation" | "ota" | "error";

export type LogSeverity = "critical" | "warning" | "info" | "success";

export type LogEntry = {
  id: number;
  category: LogCategory;
  severity: LogSeverity;
  timestamp: string;
  home_id: number | null;
  gateway_uid: string | null;
  message: string;
  details: Record<string, unknown> | null;
};

export type NotificationSeverity = "critical" | "warning" | "info" | "success";

export type MockNotification = AppNotification & {
  severity: NotificationSeverity;
  home_id: number | null;
};

export type HomeTimelineEvent = {
  id: number;
  home_id: number;
  timestamp: string;
  label: string;
  description: string;
};

// Team/staff accounts reuse `ApiUser` as-is (admin/operator) — no new type needed.
export type StaffAccount = ApiUser;
