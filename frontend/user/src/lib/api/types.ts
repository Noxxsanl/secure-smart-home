// ---------------------------------------------------------------------------
// DTO của API khách hàng kênh web `/api/portal/**` (CONTRACT_V2 §3, §4).
// Tên trường snake_case giống hệt JSON backend trả về; thời gian là chuỗi ISO UTC.
// ---------------------------------------------------------------------------

export type HomeStatus = "unclaimed" | "active" | "suspended";
export type MemberRole = "OWNER" | "CONTROLLER" | "VIEWER" | "GUEST";
export type AssignableRole = Exclude<MemberRole, "OWNER">;
export type DeviceCategory = "gateway" | "sensor" | "relay" | "camera" | "door_contact";
export type DeviceStatus = "active" | "inactive" | "blocked";
export type Severity = "critical" | "warning" | "info" | "success";
export type PackageCode = "KIT_A" | "KIT_B";
// Backend kiểm tra room_type trong tập này; giữ kiểu string để không vỡ khi có loại mới.
export type RoomType =
  | "living_room" | "bedroom" | "kitchen" | "bathroom" | "office" | "garage" | "garden" | "door";

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

export type RoomSummary = {
  id: number;
  home_id: number;
  name: string;
  room_type: RoomType | string;
  sort_order: number;
  // Số đo mới nhất của cảm biến trong phòng; null khi chưa có.
  temperature: number | null;
  humidity: number | null;
  has_climate_data: boolean;
  climate_updated_at: string | null;
  // Không tính gateway.
  device_count: number;
  online_count: number;
  on_count: number;
};

export type Reading = {
  temperature: number | null;
  humidity: number | null;
  door_open: boolean | null;
  received_at: string;
};

export type CustomerDevice = {
  id: number;
  device_uid: string;
  device_name: string;
  category: DeviceCategory;
  home_id: number;
  room_id: number | null;
  room_name: string | null;
  status: DeviceStatus;
  online: boolean;
  last_seen: string | null;
  // Chỉ relay có giá trị; thiết bị khác là null.
  power: boolean | null;
  latest: Reading | null;
  // relay && role cho phép (GUEST: thiết bị được chỉ định, chưa hết hạn). Không phụ thuộc online.
  can_control: boolean;
};

export type MyHome = {
  home: Home;
  role: MemberRole;
  device_count: number;
  online_count: number;
  // Hạn truy cập của GUEST; null với role khác.
  expires_at: string | null;
};

export type GatewaySummary = {
  id: number;
  uid: string;
  status: "online" | "offline";
  last_seen: string | null;
};

export type HomeOverview = {
  home: Home;
  role: MemberRole;
  gateway: GatewaySummary | null;
  rooms: RoomSummary[];
  devices: CustomerDevice[];
  // Thông báo warning + critical chưa đọc.
  open_alerts: number;
  pending_suggestions: number;
  unread_notifications: number;
};

export type RoomDetail = {
  room: RoomSummary;
  home: Home;
  role: MemberRole;
  devices: CustomerDevice[];
};

export type DeviceDetail = {
  device: CustomerDevice;
  room: RoomSummary | null;
  home: Home;
  role: MemberRole;
};

export type DeviceAction = "turn_on" | "turn_off";

export type DeviceCommandResult = {
  command: {
    id: number;
    action: DeviceAction;
    status: "acked";
    issued_at: string;
    acked_at: string | null;
  };
  device: CustomerDevice;
};

export type TelemetryRange = "24h" | "7d";

export type TelemetryPoint = {
  t: string;
  temperature: number | null;
  humidity: number | null;
};

export type Telemetry = {
  device_id: number;
  range: TelemetryRange;
  // 300 (24h) hoặc 3600 (7d).
  bucket_seconds: number;
  points: TelemetryPoint[];
  latest: Reading | null;
};

export type CustomerNotification = {
  id: number;
  home_id: number | null;
  home_name: string | null;
  type: string;
  title: string;
  message: string;
  severity: Severity;
  is_read: boolean;
  created_at: string;
};

export type NotificationList = {
  notifications: CustomerNotification[];
  unread_count: number;
};

export type PortalMember = {
  id: number;
  home_id: number;
  user_id: number | null;
  name: string;
  initials: string;
  // Chỉ có khi người gọi là OWNER.
  email: string | null;
  role: MemberRole;
  is_me: boolean;
  // Lời mời chưa được chấp nhận (chỉ OWNER thấy).
  pending: boolean;
  invite_expires_at: string | null;
  // Hạn truy cập của GUEST.
  expires_at: string | null;
  guest_device_ids: number[];
  joined_at: string | null;
};

export type InviteMemberInput = {
  email: string;
  name: string;
  role: AssignableRole;
  // Bắt buộc với GUEST: trong tương lai, tối đa 30 ngày.
  expires_at?: string;
  // Bắt buộc với GUEST: thiết bị của nhà này.
  device_ids?: number[];
};

export type UpdateMemberInput = {
  role?: AssignableRole;
  expires_at?: string;
  device_ids?: number[];
};

export type Invitation = {
  id: number;
  home: { id: number; name: string; address: string | null };
  role: MemberRole;
  invited_by_name: string | null;
  invite_expires_at: string;
  expires_at: string | null;
};

export type TriggerType = "sensor_threshold" | "schedule";
export type TriggerMetric = "temperature" | "humidity";
export type TriggerOperator = ">" | "<" | "=";

export type AutomationRule = {
  id: number;
  home_id: number;
  home_name: string;
  name: string;
  enabled: boolean;
  trigger_type: TriggerType;
  trigger_room_id: number | null;
  trigger_room_name: string | null;
  trigger_metric: TriggerMetric | null;
  trigger_operator: TriggerOperator | null;
  trigger_threshold: number | null;
  // "HH:MM" theo múi giờ của nhà.
  schedule_time: string | null;
  // ISO weekday 1 = Thứ 2 … 7 = Chủ nhật.
  schedule_days: number[] | null;
  action_device_id: number | null;
  action_device_name: string | null;
  action_command: DeviceAction;
  origin: "user" | "ai_suggested";
  created_by_user_id: number | null;
  created_by_name: string | null;
  last_triggered_at: string | null;
  created_at: string;
  can_edit: boolean;
  can_delete: boolean;
};

export type CreateAutomationInput = {
  name: string;
  trigger_type: TriggerType;
  trigger_room_id?: number;
  trigger_metric?: TriggerMetric;
  trigger_operator?: TriggerOperator;
  trigger_threshold?: number;
  schedule_time?: string;
  schedule_days?: number[];
  action_device_id: number;
  action_command: DeviceAction;
};

export type UpdateAutomationInput = Partial<CreateAutomationInput> & { enabled?: boolean };

export type AutomationHistoryEntry = {
  id: number;
  triggered_at: string;
  result: "success" | "failed" | "skipped";
  details: Record<string, unknown> | null;
};

export type HabitSuggestion = {
  id: number;
  home_id: number;
  device_id: number;
  device_name: string;
  room_name: string | null;
  action: DeviceAction;
  time_of_day: string;
  days_matched: number;
  window_days: number;
  status: "pending" | "accepted" | "dismissed";
  created_at: string;
  responded_at: string | null;
  rule_id: number | null;
};

export type AcceptSuggestionResult = { suggestion: HabitSuggestion; rule: AutomationRule };
export type DismissSuggestionResult = { suggestion: HabitSuggestion };

export type ClaimResult = { home: Home; role: "OWNER" };

export type CustomerProfile = {
  customer_id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  user_tag: string;
  joined_at: string;
};

export type UpdateProfileInput = {
  full_name?: string;
  phone?: string | null;
  address?: string | null;
};
