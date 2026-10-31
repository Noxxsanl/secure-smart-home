// ---------------------------------------------------------------------------
// DTO của kênh Dashboard (`/api/dashboard/**`) — khớp hợp đồng V2 (§3 DTO dùng
// chung, §5 Dashboard API). Field giữ nguyên `snake_case` như backend trả về;
// thời gian là chuỗi ISO-8601 UTC. Không có field secret nào ở đây (bất biến 1):
// secret thiết bị/gateway không bao giờ đi qua Dashboard.
//
// Vài kiểu hợp đồng chỉ nhắc tên mà chưa liệt kê field (ConsoleRoom,
// ConsoleMember, ActivationRecord) — định nghĩa theo DTO gần nhất và để các
// field không chắc chắn là optional, UI luôn có giá trị dự phòng.
// ---------------------------------------------------------------------------

export type HomeStatus = "unclaimed" | "active" | "suspended";
export type PackageCode = "KIT_A" | "KIT_B";
export type MemberRole = "OWNER" | "CONTROLLER" | "VIEWER" | "GUEST";
export type DeviceCategory = "gateway" | "sensor" | "relay" | "camera" | "door_contact";
export type DeviceStatus = "active" | "inactive" | "blocked";
export type Severity = "critical" | "warning" | "info" | "success";
export type RoomType =
  | "living_room" | "bedroom" | "kitchen" | "bathroom"
  | "office" | "garage" | "garden" | "door";
export type StaffRole = "admin" | "operator";

export type LogCategory =
  | "gateway" | "device" | "provision" | "mqtt" | "security"
  | "auth" | "activity" | "automation" | "ota" | "error";

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

// ---------------------------------------------------------------------------
// Smart Home
// ---------------------------------------------------------------------------
export type Home = {
  id: number;
  name: string;
  address: string | null;
  package: PackageCode;
  status: HomeStatus;
  timezone: string;
  owner_customer_id: number | null;
  gateway_id: number | null;
  activated_at: string | null;
  created_at: string;
};

export type SmartHomeDetailHome = Home & {
  owner_name: string | null;
  expected_owner_name: string | null;
  created_by_username: string | null;
};

export type SmartHomeRow = {
  id: number;
  name: string;
  address: string | null;
  package: PackageCode;
  status: HomeStatus;
  owner_customer_id: number | null;
  owner_name: string | null;
  gateway_id: number | null;
  gateway_uid: string | null;
  gateway_online: boolean | null;
  room_count: number;
  device_count: number;
  created_at: string;
  activated_at: string | null;
};

/** = RoomSummary (§3). Khi Operator bị giới hạn: temperature/humidity = null. */
export type ConsoleRoom = {
  id: number;
  home_id: number;
  name: string;
  room_type: RoomType | string;
  sort_order?: number;
  temperature: number | null;
  humidity: number | null;
  has_climate_data?: boolean;
  climate_updated_at?: string | null;
  device_count: number;
  online_count?: number;
  on_count?: number;
};

export type ConsoleMember = {
  id: number;
  home_id: number;
  user_id?: number | null;
  name: string;
  initials?: string;
  email?: string | null;
  role: MemberRole;
  pending?: boolean;
  invite_expires_at?: string | null;
  expires_at?: string | null;
  joined_at?: string | null;
};

export type TimelineEvent = {
  id: number;
  timestamp: string;
  event_type: string;
  label: string;
  description: string | null;
};

export type ActivationStatus = "unused" | "used" | "revoked" | "expired" | "none";

export type HomeActivationInfo = {
  status: ActivationStatus;
  expires_at: string | null;
  used_at: string | null;
  created_at: string | null;
};

/** Plaintext mã kích hoạt — CHỈ có trong response tạo/tạo lại (in một lần). */
export type ActivationCodeIssued = {
  code: string;
  qr_payload: string;
  expires_at: string;
};

export type ProvisionNode = {
  node_uid: string;
  room_id: number;
  room_name: string;
  device_names: string[];
};

export type ProvisionResult = {
  home: SmartHomeDetailHome;
  rooms: ConsoleRoom[];
  gateway: Gateway;
  devices: ConsoleDevice[];
  nodes: ProvisionNode[];
  activation: ActivationCodeIssued;
};

export type SmartHomeDetail = {
  home: SmartHomeDetailHome;
  owner: Customer | null;
  gateway: Gateway | null;
  rooms: ConsoleRoom[];
  devices: ConsoleDevice[];
  members: ConsoleMember[];
  automation_rules: AutomationRule[];
  timeline: TimelineEvent[];
  activation: HomeActivationInfo;
  access: { restricted: boolean; grant: OperatorAccessGrant | null };
};

export type CreateSmartHomeInput = {
  name: string;
  package: PackageCode;
  address?: string;
  expected_owner_name?: string;
};

export type UpdateSmartHomeInput = {
  name?: string;
  address?: string | null;
  status?: "active" | "suspended";
};

export type AccessRequestInput = {
  reason: string;
  duration_hours: number;
};

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export type Customer = {
  id: number;
  user_id: number;
  name: string;
  user_tag: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  joined_at: string;
  status: "active" | "inactive";
  homes_count: number;
  last_login: string | null;
};

export type Warranty = {
  id: number;
  home_id: number;
  home_name: string;
  package: PackageCode;
  starts_at: string;
  expires_at: string;
};

export type ActivationMethod = "qr" | "code" | "operator_assign";

export type ActivationRecord = {
  id: number;
  customer_id: number | null;
  customer_name?: string | null;
  home_id: number | null;
  home_name: string | null;
  activated_at: string;
  result: "success" | "failed";
  method: ActivationMethod;
  reason: string | null;
};

export type CustomerDetail = {
  customer: Customer;
  homes: SmartHomeRow[];
  warranties: Warranty[];
  activations: ActivationRecord[];
};

// ---------------------------------------------------------------------------
// Gateways
// ---------------------------------------------------------------------------
export type Gateway = {
  id: number;
  uid: string;
  home_id: number | null;
  home_name: string | null;
  status: "online" | "offline";
  device_status: DeviceStatus;
  firmware_version: string | null;
  wifi_ssid: string | null;
  rssi: number | null;
  mqtt_status: "connected" | "disconnected";
  last_seen: string | null;
  last_ip: string | null;
  provision_status: "pending" | "provisioned";
  node_count: number;
  paired_count: number;
  device_count: number;
  is_simulated: boolean;
  created_at: string;
};

export type GatewayDetail = {
  gateway: Gateway;
  home: SmartHomeRow | null;
  nodes: ConsoleDevice[];
  logs: LogEntry[];
};

export type CommandAccepted = { command_id: string | number };

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------
export type ConsoleDevice = {
  id: number;
  device_uid: string;
  device_name: string;
  device_type: "sensor" | "gateway";
  category: DeviceCategory;
  status: DeviceStatus;
  online: boolean;
  last_seen: string | null;
  last_ip: string | null;
  fail_count: number;
  home_id: number | null;
  home_name: string | null;
  room_id: number | null;
  room_name: string | null;
  gateway_id: number | null;
  gateway_uid: string | null;
  node_uid: string | null;
  power: boolean | null;
  firmware_version: string | null;
  is_simulated: boolean;
  sim_online: boolean;
  location: string | null;
  created_at: string;
};

export type DeviceCommandStatus = "pending" | "sent" | "acked" | "failed" | "timeout";

export type DeviceCommandRecord = {
  id: number;
  command: string;
  status: DeviceCommandStatus;
  source: "user" | "automation" | "operator";
  channel: "mobile" | "web" | "dashboard" | "system";
  issued_by_name: string | null;
  issued_at: string;
  acked_at: string | null;
};

export type DeviceDetail = {
  device: ConsoleDevice;
  recent_commands: DeviceCommandRecord[];
};

export type DeviceListFilters = {
  home_id?: number | null;
  status?: DeviceStatus | null;
  category?: DeviceCategory | null;
  q?: string;
  include_gateways?: boolean;
};

export type UpdateDeviceInput = {
  device_name?: string;
  home_id?: number | null;
  room_id?: number | null;
};

export type TelemetryRange = "24h" | "7d";

export type Reading = {
  temperature: number | null;
  humidity: number | null;
  door_open: boolean | null;
  received_at: string;
};

export type TelemetryPoint = {
  t: string;
  temperature: number | null;
  humidity: number | null;
};

export type Telemetry = {
  device_id: number;
  range: TelemetryRange;
  bucket_seconds: number;
  points: TelemetryPoint[];
  latest: Reading | null;
};

// ---------------------------------------------------------------------------
// Automation (§3 AutomationRule)
// ---------------------------------------------------------------------------
export type AutomationRule = {
  id: number;
  home_id: number;
  home_name: string;
  name: string;
  enabled: boolean;
  trigger_type: "sensor_threshold" | "schedule";
  trigger_room_id: number | null;
  trigger_room_name: string | null;
  trigger_metric: "temperature" | "humidity" | null;
  trigger_operator: ">" | "<" | "=" | null;
  trigger_threshold: number | null;
  schedule_time: string | null;
  schedule_days: number[] | null;
  action_device_id: number | null;
  action_device_name: string | null;
  action_command: "turn_on" | "turn_off";
  origin: "user" | "ai_suggested";
  created_by_user_id: number | null;
  created_by_name: string | null;
  last_triggered_at: string | null;
  created_at: string;
  can_edit: boolean;
  can_delete: boolean;
};

// ---------------------------------------------------------------------------
// OTA & firmware
// ---------------------------------------------------------------------------
export type FirmwareType = "gateway" | "node";

export type FirmwareVersion = {
  id: number;
  type: FirmwareType;
  version: string;
  stable: boolean;
  released_at: string;
  file_name: string;
  size_kb: number;
  checksum_sha256: string;
  release_notes: string | null;
  uploaded_by_username: string | null;
};

export type OtaDeploymentStatus = "in_progress" | "completed" | "rolled_back" | "failed";

export type OtaDeployment = {
  id: number;
  firmware_id: number;
  firmware_version: string;
  firmware_type: FirmwareType;
  scope: "fleet" | "home";
  target_home_id: number | null;
  target_home_name: string | null;
  progress_percent: number;
  target_count: number;
  applied_count: number;
  failed_count: number;
  status: OtaDeploymentStatus;
  started_at: string;
  created_by_username: string | null;
};

export type UploadFirmwareInput = {
  type: FirmwareType;
  version: string;
  stable: boolean;
  file: File;
  release_notes?: string;
};

export type CreateDeploymentInput = {
  firmware_id: number;
  scope: "fleet" | "home";
  target_home_id?: number;
};

// ---------------------------------------------------------------------------
// Notifications (staff, FR-8.5)
// ---------------------------------------------------------------------------
export type StaffNotification = {
  id: number;
  title: string;
  message: string;
  type: string;
  severity: Severity;
  home_id: number | null;
  related_device_id: number | null;
  actor_id: number | null;
  actor_username: string | null;
  actor_role: string | null;
  target_role: string;
  is_read: boolean;
  created_at: string;
};

export type StaffNotificationsResponse = {
  notifications: StaffNotification[];
  unread_count: number;
};

// ---------------------------------------------------------------------------
// Logs (§3 LogEntry, FR-10.4)
// ---------------------------------------------------------------------------
export type LogEntry = {
  id: number;
  category: LogCategory;
  severity: Severity;
  event_type: string;
  timestamp: string;
  home_id: number | null;
  home_name: string | null;
  gateway_uid: string | null;
  device_uid: string | null;
  actor_username: string | null;
  ip_address: string | null;
  message: string;
  details: Record<string, unknown> | null;
};

export type LogFilters = {
  home_id?: number | null;
  severity?: Severity | null;
  from?: string | null;
  to?: string | null;
  actor?: string;
  q?: string;
  page?: number;
  limit?: number;
};

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export type ConsoleBadges = {
  unclaimed_homes: number;
  offline_gateways: number;
  ota_in_progress: number;
  unread_notifications: number;
};

export type OperatorStats = {
  provisioning_queue: SmartHomeRow[];
  active_access_grants: OperatorAccessGrant[];
  open_tickets: number;
  alerts_to_handle: number;
  gateways_offline: number;
  gateways_total: number;
  recent_logs: LogEntry[];
};

export type AdminStats = {
  total_customers: number;
  total_smart_homes: number;
  unclaimed_homes: number;
  active_homes: number;
  suspended_homes: number;
  gateways_online: number;
  gateways_total: number;
  devices_online: number;
  devices_total: number;
  open_alerts: number;
  top_errors: LogEntry[];
  firmware_rollouts: OtaDeployment[];
  recent_activity: LogEntry[];
  recent_activations: ActivationRecord[];
};

// ---------------------------------------------------------------------------
// Team & Operator Access (FR-11.4, FR-9.6)
// ---------------------------------------------------------------------------
export type StaffAccount = {
  id: number;
  username: string;
  role: StaffRole;
  status: "active" | "locked";
  created_at: string;
  last_login: string | null;
};

export type OperatorAccessGrant = {
  id: number;
  operator_id: number;
  operator_username: string;
  home_id: number;
  home_name: string;
  reason: string;
  granted_by: number;
  granted_by_username: string | null;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  active: boolean;
};

export type GrantAccessInput = {
  operator_id: number;
  home_id: number;
  reason: string;
  duration_hours: number;
};

// ---------------------------------------------------------------------------
// AI & simulator
// ---------------------------------------------------------------------------
export type HabitJobResult = {
  homes_scanned: number;
  suggestions_created: number;
};

export type SimulatorStatus = { enabled: boolean };
