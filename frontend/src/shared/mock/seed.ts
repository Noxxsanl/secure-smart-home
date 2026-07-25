import type {
  ActivationRecord, AutomationRule, Camera, Customer, FirmwareVersion,
  Gateway, HomeMember, HomeTimelineEvent, LogCategory, LogEntry, LogSeverity,
  MockDevice, MockNotification, NotificationSeverity, OperatorAccessGrant,
  OtaDeployment, Room, SmartHome, StaffAccount, WarrantyRecord,
} from "@/shared/mock/types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = () => Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

// ---------------------------------------------------------------------------
// Customers — kept small (5) so lists/tables are quick to scan in a demo.
// ---------------------------------------------------------------------------
export const customers: Customer[] = [
  { id: 1, name: "Nguyễn Hoàng Đạt", user_tag: "dat#4821", phone: "0912 345 678", email: "admin@smarthome.local", address: "12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh", joined_at: iso(now() - 200 * DAY), status: "active" },
  { id: 2, name: "Lê Văn Hùng", user_tag: "hung#3312", phone: "0977 222 333", email: "hung.le@example.com", address: "78 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh", joined_at: iso(now() - 120 * DAY), status: "active" },
  { id: 3, name: "Đỗ Minh Quân", user_tag: "quan#7756", phone: "0909 444 555", email: "quan.do@example.com", address: "156 Điện Biên Phủ, Bình Thạnh, TP. Hồ Chí Minh", joined_at: iso(now() - 80 * DAY), status: "active" },
  { id: 4, name: "Hoàng Đức Anh", user_tag: "ducanh#9021", phone: "0933 666 777", email: "anh.hoang@example.com", address: "201 Cách Mạng Tháng 8, Quận 10, TP. Hồ Chí Minh", joined_at: iso(now() - 40 * DAY), status: "inactive" },
  // Đã đăng ký trên Mobile App nhưng chưa sở hữu Smart Home nào — mục tiêu demo cho luồng Operator gán quyền theo user_tag.
  { id: 5, name: "Ngô Kim Anh", user_tag: "kimanh#1560", phone: "0977 888 999", email: "anh.ngo@example.com", address: "88 Võ Văn Ngân, Thủ Đức, TP. Hồ Chí Minh", joined_at: iso(now() - 15 * DAY), status: "active" },
  { id: 6, name: "Trần Bảo Ngọc", user_tag: "ngoc#2094", phone: "0966 111 234", email: "ngoc.tran@example.com", address: "34 Lý Thường Kiệt, Quận 10, TP. Hồ Chí Minh", joined_at: iso(now() - 2 * DAY), status: "active" },
];

// ---------------------------------------------------------------------------
// Smart Homes — 6 total: 3 active + 1 suspended (all with an owner), 2 unclaimed
// (fresh kits sitting in the provisioning queue). Home #1 is the rich,
// mobile-synced household ("Nhà của Đạt").
// ---------------------------------------------------------------------------
export const smartHomes: SmartHome[] = [
  { id: 1, name: "Nhà của Đạt", address: "12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh", package: "KIT_A", status: "active", customer_id: 1, gateway_id: 1, activated_at: iso(now() - 190 * DAY), created_at: iso(now() - 195 * DAY) },
  { id: 2, name: "Nhà Quận 7", address: "78 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh", package: "KIT_A", status: "active", customer_id: 2, gateway_id: 2, activated_at: iso(now() - 110 * DAY), created_at: iso(now() - 115 * DAY) },
  { id: 3, name: "Nhà Bình Thạnh", address: "156 Điện Biên Phủ, Bình Thạnh, TP. Hồ Chí Minh", package: "KIT_A", status: "active", customer_id: 3, gateway_id: 3, activated_at: iso(now() - 75 * DAY), created_at: iso(now() - 78 * DAY) },
  { id: 4, name: "Nhà Quận 10", address: "201 Cách Mạng Tháng 8, Quận 10, TP. Hồ Chí Minh", package: "KIT_A", status: "suspended", customer_id: 4, gateway_id: 4, activated_at: iso(now() - 35 * DAY), created_at: iso(now() - 38 * DAY) },
  { id: 5, name: "Kit KIT_A #0005", address: "Kho vận — chưa xuất kho", package: "KIT_A", status: "unclaimed", customer_id: null, gateway_id: 5, activated_at: null, created_at: iso(now() - 4 * DAY) },
  { id: 6, name: "Kit KIT_B #0006", address: "Kho vận — chờ in tem", package: "KIT_B", status: "unclaimed", customer_id: null, gateway_id: 6, activated_at: null, created_at: iso(now() - 1 * DAY) },
];

// ---------------------------------------------------------------------------
// Rooms — home #1 mirrors mobile's MockRooms exactly (name/temp/humidity/power).
// Unclaimed kits (5, 6) have no rooms yet — nothing provisioned until claimed.
// ---------------------------------------------------------------------------
export const rooms: Room[] = [
  // Home 1 — synced 1:1 with mobile/lib/features/rooms/data/mock_rooms.dart
  { id: 1, home_id: 1, name: "Living room", room_type: "living_room", temperature: 16, humidity: 45, power_usage: 310, has_climate_data: true },
  { id: 2, home_id: 1, name: "Bedroom", room_type: "bedroom", temperature: 29, humidity: 34, power_usage: 240, has_climate_data: true },
  { id: 3, home_id: 1, name: "Kitchen", room_type: "kitchen", temperature: 21, humidity: 40, power_usage: 180, has_climate_data: true },
  { id: 4, home_id: 1, name: "Bathroom", room_type: "bathroom", temperature: 23, humidity: 60, power_usage: 60, has_climate_data: false },

  { id: 5, home_id: 2, name: "Living room", room_type: "living_room", temperature: 27, humidity: 55, power_usage: 220, has_climate_data: true },
  { id: 6, home_id: 2, name: "Bedroom", room_type: "bedroom", temperature: 25, humidity: 50, power_usage: 150, has_climate_data: true },

  { id: 7, home_id: 3, name: "Living room", room_type: "living_room", temperature: 26, humidity: 60, power_usage: 200, has_climate_data: true },
  { id: 8, home_id: 3, name: "Bedroom", room_type: "bedroom", temperature: 24, humidity: 52, power_usage: 130, has_climate_data: true },

  { id: 9, home_id: 4, name: "Living room", room_type: "living_room", temperature: 28, humidity: 60, power_usage: 0, has_climate_data: true },
];

// ---------------------------------------------------------------------------
// Members — home #1 reuses mobile/lib/features/profile/data/mock_household.dart
// ---------------------------------------------------------------------------
export const homeMembers: HomeMember[] = [
  { id: 1, home_id: 1, name: "Nguyễn Hoàng Đạt", initials: "HĐ", role: "OWNER", is_you: true },
  { id: 2, home_id: 1, name: "Thu Hằng", initials: "TH", role: "CONTROLLER" },
  { id: 3, home_id: 1, name: "Bé Bin", initials: "BB", role: "GUEST" },
  { id: 4, home_id: 2, name: "Lê Văn Hùng", initials: "LH", role: "OWNER", is_you: true },
  { id: 5, home_id: 3, name: "Đỗ Minh Quân", initials: "ĐQ", role: "OWNER", is_you: true },
  { id: 6, home_id: 4, name: "Hoàng Đức Anh", initials: "HA", role: "OWNER", is_you: true },
];

// ---------------------------------------------------------------------------
// Gateways — 1:1 with Smart Homes, 8-metric fleet console data.
// ---------------------------------------------------------------------------
export const gateways: Gateway[] = [
  { id: 1, home_id: 1, uid: "ESP32-GW-A1B2C3D4", status: "online", firmware_version: "2.3.1", wifi_ssid: "Home_5G", rssi: -52, mqtt_status: "connected", last_seen: iso(now() - 90 * 1000), provision_status: "provisioned", node_count: 10, paired_count: 10 },
  { id: 2, home_id: 2, uid: "ESP32-GW-B7E1F220", status: "online", firmware_version: "2.3.1", wifi_ssid: "NhaQ7_WiFi", rssi: -61, mqtt_status: "connected", last_seen: iso(now() - 40 * 1000), provision_status: "provisioned", node_count: 2, paired_count: 2 },
  { id: 3, home_id: 3, uid: "ESP32-GW-C93A7710", status: "offline", firmware_version: "2.3.0", wifi_ssid: "BinhThanh_Home", rssi: -88, mqtt_status: "disconnected", last_seen: iso(now() - 3 * HOUR), provision_status: "provisioned", node_count: 2, paired_count: 2 },
  { id: 4, home_id: 4, uid: "ESP32-GW-07185550", status: "offline", firmware_version: "2.2.4", wifi_ssid: "Q10_Home", rssi: -95, mqtt_status: "disconnected", last_seen: iso(now() - 5 * DAY), provision_status: "provisioned", node_count: 1, paired_count: 0 },
  { id: 5, home_id: 5, uid: "ESP32-GW-293A7772", status: "offline", firmware_version: "2.3.1", wifi_ssid: "—", rssi: 0, mqtt_status: "disconnected", last_seen: null, provision_status: "pending", node_count: 0, paired_count: 0 },
  { id: 6, home_id: 6, uid: "ESP32-GW-3A4B8883", status: "offline", firmware_version: "2.3.1", wifi_ssid: "—", rssi: 0, mqtt_status: "disconnected", last_seen: null, provision_status: "pending", node_count: 0, paired_count: 0 },
];

// ---------------------------------------------------------------------------
// Devices — home #1 mirrors mobile/lib/features/devices/data/mock_devices.dart
// (names/descriptions kept verbatim), mapped onto the new Room/category model.
// ---------------------------------------------------------------------------
export const devices: MockDevice[] = [
  { id: 1, device_id: "ESP32-SN-0001", device_name: "Cảm biến nhiệt/ẩm - Living room", device_type: "sensor", status: "active", location: "Living room", last_seen: iso(now() - 20 * 1000), fail_count: 0, created_by: 1, home_id: 1, room_id: 1, category: "sensor" },
  { id: 2, device_id: "ESP32-SN-0002", device_name: "Cảm biến nhiệt/ẩm - Bedroom", device_type: "sensor", status: "active", location: "Bedroom", last_seen: iso(now() - 25 * 1000), fail_count: 0, created_by: 1, home_id: 1, room_id: 2, category: "sensor" },
  { id: 3, device_id: "ESP32-SN-0003", device_name: "Cảm biến nhiệt/ẩm - Kitchen", device_type: "sensor", status: "active", location: "Kitchen", last_seen: iso(now() - 35 * 1000), fail_count: 0, created_by: 1, home_id: 1, room_id: 3, category: "sensor" },
  { id: 4, device_id: "ESP32-RL-0004", device_name: "Vacuum", device_type: "gateway", status: "inactive", location: "Living room", last_seen: iso(now() - 2 * HOUR), fail_count: 0, created_by: 1, home_id: 1, room_id: 1, category: "relay" },
  { id: 5, device_id: "ESP32-RL-0005", device_name: "Air Conditioning", device_type: "sensor", status: "active", location: "Bedroom", last_seen: iso(now() - 10 * 1000), fail_count: 0, created_by: 1, home_id: 1, room_id: 2, category: "sensor" },
  { id: 6, device_id: "ESP32-RL-0006", device_name: "Automatic Curtains", device_type: "gateway", status: "active", location: "Bedroom", last_seen: iso(now() - 40 * 1000), fail_count: 0, created_by: 1, home_id: 1, room_id: 2, category: "relay" },
  { id: 7, device_id: "ESP32-RL-0007", device_name: "Automatic Irrigation", device_type: "gateway", status: "inactive", location: "Living room", last_seen: iso(now() - 6 * HOUR), fail_count: 0, created_by: 1, home_id: 1, room_id: 1, category: "relay" },
  { id: 8, device_id: "ESP32-RL-0008", device_name: "Speakers", device_type: "gateway", status: "inactive", location: "Living room", last_seen: iso(now() - 8 * HOUR), fail_count: 0, created_by: 1, home_id: 1, room_id: 1, category: "relay" },
  { id: 9, device_id: "ESP32-RL-0009", device_name: "Lightings", device_type: "gateway", status: "active", location: "Living room", last_seen: iso(now() - 15 * 1000), fail_count: 0, created_by: 1, home_id: 1, room_id: 1, category: "relay" },
  { id: 10, device_id: "ESP32-DC-0010", device_name: "Door locks", device_type: "gateway", status: "inactive", location: "Living room", last_seen: iso(now() - 12 * HOUR), fail_count: 0, created_by: 1, home_id: 1, room_id: 1, category: "door_contact" },

  { id: 11, device_id: "ESP32-SN-0011", device_name: "Cảm biến nhiệt/ẩm - Living room", device_type: "sensor", status: "active", location: "Living room", last_seen: iso(now() - 45 * 1000), fail_count: 0, created_by: 1, home_id: 2, room_id: 5, category: "sensor" },
  { id: 12, device_id: "ESP32-RL-0012", device_name: "Lightings", device_type: "gateway", status: "active", location: "Living room", last_seen: iso(now() - 30 * 1000), fail_count: 0, created_by: 1, home_id: 2, room_id: 5, category: "relay" },

  { id: 13, device_id: "ESP32-SN-0013", device_name: "Cảm biến nhiệt/ẩm - Bedroom", device_type: "sensor", status: "inactive", location: "Bedroom", last_seen: iso(now() - 4 * HOUR), fail_count: 3, created_by: 1, home_id: 3, room_id: 8, category: "sensor" },
  { id: 14, device_id: "ESP32-RL-0014", device_name: "Air Conditioning", device_type: "gateway", status: "blocked", location: "Bedroom", last_seen: iso(now() - 5 * HOUR), fail_count: 5, created_by: 1, home_id: 3, room_id: 8, category: "relay" },

  { id: 15, device_id: "ESP32-DC-0015", device_name: "Door locks", device_type: "gateway", status: "active", location: "Living room", last_seen: iso(now() - 27 * 1000), fail_count: 0, created_by: 1, home_id: 4, room_id: 9, category: "door_contact" },
];

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------
export const cameras: Camera[] = [
  { id: 1, home_id: 1, room_id: 1, name: "Camera cửa chính", status: "online" },
  { id: 2, home_id: 2, room_id: 5, name: "Camera cửa chính", status: "online" },
];

// ---------------------------------------------------------------------------
// Automation rules — MVP IF/THEN
// ---------------------------------------------------------------------------
export const automationRules: AutomationRule[] = [
  { id: 1, home_id: 1, name: "Bếp > 30°C → Bật quạt", enabled: true, trigger_room_id: 3, trigger_metric: "temperature", trigger_operator: ">", trigger_threshold: 30, action_device_id: 9, action_command: "turn_on" },
  { id: 2, home_id: 1, name: "Phòng ngủ ẩm > 55% → Bật điều hoà", enabled: false, trigger_room_id: 2, trigger_metric: "humidity", trigger_operator: ">", trigger_threshold: 55, action_device_id: 5, action_command: "turn_on" },
  { id: 3, home_id: 2, name: "Bedroom > 27°C → Bật điều hoà", enabled: true, trigger_room_id: 6, trigger_metric: "temperature", trigger_operator: ">", trigger_threshold: 27, action_device_id: 12, action_command: "turn_on" },
];

// ---------------------------------------------------------------------------
// Firmware & OTA — kept small; new uploads via the OTA console append here
// with no deployment until an Admin/Operator explicitly clicks Deploy.
// ---------------------------------------------------------------------------
export const firmwareVersions: FirmwareVersion[] = [
  { id: 1, type: "gateway", version: "2.3.1", stable: true, released_at: iso(now() - 20 * DAY), file_name: "gateway-fw-2.3.1.bin", size_kb: 1840 },
  { id: 2, type: "gateway", version: "2.4.0-beta", stable: false, released_at: iso(now() - 2 * DAY), file_name: "gateway-fw-2.4.0-beta.bin", size_kb: 1912 },
  { id: 3, type: "node", version: "1.8.0", stable: true, released_at: iso(now() - 35 * DAY), file_name: "node-fw-1.8.0.bin", size_kb: 612 },
];

export const otaDeployments: OtaDeployment[] = [
  { id: 1, firmware_id: 1, scope: "fleet", target_home_id: null, progress_percent: 40, target_count: 6, status: "in_progress", started_at: iso(now() - 1 * HOUR) },
  { id: 2, firmware_id: 3, scope: "fleet", target_home_id: null, progress_percent: 100, target_count: 15, status: "completed", started_at: iso(now() - 35 * DAY) },
];

// ---------------------------------------------------------------------------
// Warranty & activation history
// ---------------------------------------------------------------------------
export const warrantyRecords: WarrantyRecord[] = [
  { id: 1, home_id: 1, package: "KIT_A", expires_at: iso(now() + 165 * DAY) },
  { id: 2, home_id: 2, package: "KIT_A", expires_at: iso(now() + 255 * DAY) },
  { id: 3, home_id: 3, package: "KIT_A", expires_at: iso(now() + 290 * DAY) },
  { id: 4, home_id: 4, package: "KIT_A", expires_at: iso(now() + 330 * DAY) },
];

export const activationRecords: ActivationRecord[] = [
  { id: 1, customer_id: 1, home_id: 1, activated_at: iso(now() - 190 * DAY), result: "success", method: "qr" },
  { id: 2, customer_id: 2, home_id: 2, activated_at: iso(now() - 111 * DAY), result: "failed", method: "qr" },
  { id: 3, customer_id: 2, home_id: 2, activated_at: iso(now() - 110 * DAY), result: "success", method: "qr" },
  { id: 4, customer_id: 3, home_id: 3, activated_at: iso(now() - 75 * DAY), result: "success", method: "code" },
  { id: 5, customer_id: 4, home_id: 4, activated_at: iso(now() - 35 * DAY), result: "success", method: "qr" },
];

// ---------------------------------------------------------------------------
// Operator Home Access grants
// ---------------------------------------------------------------------------
export const operatorAccessGrants: OperatorAccessGrant[] = [
  { id: 1, operator_id: 2, operator_username: "operator01", home_id: 2, reason: "Gateway mất kết nối, hỗ trợ kiểm tra RSSI", granted_at: iso(now() - 2 * HOUR), expires_at: iso(now() + 4 * HOUR), revoked_at: null },
  { id: 2, operator_id: 3, operator_username: "operator02", home_id: 4, reason: "Khách hàng báo mất kết nối kéo dài", granted_at: iso(now() - 5 * DAY), expires_at: iso(now() + 2 * DAY), revoked_at: iso(now() - 4 * DAY) },
];

// ---------------------------------------------------------------------------
// Home timeline
// ---------------------------------------------------------------------------
export const homeTimelineEvents: HomeTimelineEvent[] = [
  { id: 1, home_id: 1, timestamp: iso(now() - 195 * DAY), label: "Provisioned", description: "Gateway ESP32-GW-A1B2C3D4 được tạo và gán vào kit KIT_A." },
  { id: 2, home_id: 1, timestamp: iso(now() - 190 * DAY), label: "Activated", description: "Khách hàng Nguyễn Hoàng Đạt kích hoạt nhà qua QR code." },
  { id: 3, home_id: 1, timestamp: iso(now() - 60 * DAY), label: "Firmware updated", description: "Gateway cập nhật firmware lên v2.3.0." },
  { id: 4, home_id: 1, timestamp: iso(now() - 20 * DAY), label: "Firmware updated", description: "Gateway cập nhật firmware lên v2.3.1." },
  { id: 5, home_id: 1, timestamp: iso(now() - 3 * DAY), label: "Member added", description: "Thêm thành viên Thu Hằng với vai trò Controller." },
];

// ---------------------------------------------------------------------------
// Logs — 10 categories, generated with varied severity across the last 14 days.
// ---------------------------------------------------------------------------
const LOG_TEMPLATES: Record<LogCategory, { severity: LogSeverity; message: string; home_id: number | null; gateway_uid: string | null }[]> = {
  gateway: [
    { severity: "critical", message: "Gateway ESP32-GW-C93A7710 mất kết nối > 30 phút", home_id: 3, gateway_uid: "ESP32-GW-C93A7710" },
    { severity: "warning", message: "Gateway ESP32-GW-07185550 RSSI yếu (-95dBm)", home_id: 4, gateway_uid: "ESP32-GW-07185550" },
    { severity: "info", message: "Gateway ESP32-GW-A1B2C3D4 heartbeat OK", home_id: 1, gateway_uid: "ESP32-GW-A1B2C3D4" },
    { severity: "success", message: "Gateway ESP32-GW-B7E1F220 khôi phục kết nối", home_id: 2, gateway_uid: "ESP32-GW-B7E1F220" },
  ],
  device: [
    { severity: "warning", message: "Thiết bị ESP32-RL-0014 bị khoá do fail_count vượt ngưỡng", home_id: 3, gateway_uid: null },
    { severity: "info", message: "Thiết bị ESP32-SN-0001 báo cáo dữ liệu định kỳ", home_id: 1, gateway_uid: null },
    { severity: "success", message: "Thiết bị ESP32-RL-0009 được kích hoạt lại", home_id: 1, gateway_uid: null },
  ],
  provision: [
    { severity: "success", message: "Tạo Smart Home mới #0006 từ template KIT_B", home_id: 6, gateway_uid: "ESP32-GW-3A4B8883" },
    { severity: "info", message: "Sinh Activation Code cho kit #0005", home_id: 5, gateway_uid: "ESP32-GW-293A7772" },
    { severity: "warning", message: "Kit #0005 chờ in tem quá 3 ngày", home_id: 5, gateway_uid: "ESP32-GW-293A7772" },
  ],
  mqtt: [
    { severity: "info", message: "MQTT Broker 1: 1,180 client đang kết nối", home_id: null, gateway_uid: null },
    { severity: "warning", message: "MQTT Broker 2: độ trễ publish tăng (180ms)", home_id: null, gateway_uid: null },
    { severity: "critical", message: "Gateway ESP32-GW-07185550 bị ngắt kết nối MQTT bất thường", home_id: 4, gateway_uid: "ESP32-GW-07185550" },
  ],
  security: [
    { severity: "critical", message: "GATEWAY_AUTH_FAIL liên tiếp 5 lần từ ESP32-GW-C93A7710", home_id: 3, gateway_uid: "ESP32-GW-C93A7710" },
    { severity: "warning", message: "REPLAY_ATTACK phát hiện trên thiết bị ESP32-SN-0013", home_id: 3, gateway_uid: null },
    { severity: "info", message: "Quét bảo mật định kỳ hoàn tất, không phát hiện bất thường", home_id: null, gateway_uid: null },
  ],
  auth: [
    { severity: "info", message: "Admin đăng nhập thành công", home_id: null, gateway_uid: null },
    { severity: "warning", message: "3 lần đăng nhập sai mật khẩu liên tiếp cho operator02", home_id: null, gateway_uid: null },
    { severity: "success", message: "Operator01 đổi mật khẩu thành công", home_id: null, gateway_uid: null },
  ],
  activity: [
    { severity: "info", message: "Admin cập nhật trạng thái thiết bị ESP32-RL-0009", home_id: 1, gateway_uid: null },
    { severity: "info", message: "Operator01 xem chi tiết Nhà Quận 7", home_id: 2, gateway_uid: null },
    { severity: "success", message: "Admin cấp Operator Access cho Nhà Bình Thạnh", home_id: 3, gateway_uid: null },
  ],
  automation: [
    { severity: "success", message: "Rule 'Bếp > 30°C → Bật quạt' kích hoạt thành công", home_id: 1, gateway_uid: null },
    { severity: "warning", message: "Rule 'Bedroom > 27°C → Bật điều hoà' timeout khi gửi lệnh", home_id: 2, gateway_uid: null },
    { severity: "info", message: "Admin tạo rule tự động hoá mới cho Nhà Quận 7", home_id: 2, gateway_uid: null },
  ],
  ota: [
    { severity: "info", message: "Bắt đầu rollout firmware Gateway v2.3.1 tới 6 gateway", home_id: null, gateway_uid: null },
    { severity: "warning", message: "1 gateway lỗi khi cập nhật firmware", home_id: null, gateway_uid: null },
    { severity: "success", message: "Rollout firmware Node v1.8.0 hoàn tất 100%", home_id: null, gateway_uid: null },
  ],
  error: [
    { severity: "critical", message: "Lỗi ghi dữ liệu telemetry vào database (timeout)", home_id: null, gateway_uid: null },
    { severity: "warning", message: "API latency p95 vượt ngưỡng 200ms trong 5 phút", home_id: null, gateway_uid: null },
    { severity: "info", message: "Đã tự động khôi phục sau lỗi kết nối Redis", home_id: null, gateway_uid: null },
  ],
};

function buildLogs(): LogEntry[] {
  let id = 1;
  const entries: LogEntry[] = [];
  (Object.keys(LOG_TEMPLATES) as LogCategory[]).forEach((category) => {
    LOG_TEMPLATES[category].forEach((tpl, idx) => {
      entries.push({
        id: id++,
        category,
        severity: tpl.severity,
        timestamp: iso(now() - (idx * 7 + 1) * HOUR),
        home_id: tpl.home_id,
        gateway_uid: tpl.gateway_uid,
        message: tpl.message,
        details: { category, source: "mock-seed" },
      });
    });
  });
  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export const logEntries: LogEntry[] = buildLogs();

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
function notif(
  id: number, title: string, message: string, type: string, severity: NotificationSeverity,
  target_role: string, home_id: number | null, hoursAgo: number, is_read = false,
): MockNotification {
  return {
    id, title, message, type, actor_id: 1, actor_username: "admin", actor_role: "admin",
    target_role, related_device_id: null, is_read, created_at: iso(now() - hoursAgo * HOUR),
    severity, home_id,
  };
}

export const notifications: MockNotification[] = [
  notif(1, "Gateway mất kết nối", "Gateway ESP32-GW-C93A7710 (Nhà Bình Thạnh) mất kết nối > 30 phút", "GATEWAY_OFFLINE", "critical", "admin", 3, 0.03),
  notif(2, "OTA fleet gặp lỗi", "Firmware Gateway 2.3.1 — 1 gateway cập nhật lỗi", "OTA_FAILED", "warning", "admin", null, 0.25),
  notif(3, "Thông tin khách hàng cập nhật", "Nhà Quận 7 vừa cập nhật thông tin liên hệ", "HOME_UPDATED", "info", "admin", 2, 1),
  notif(4, "Bulk OTA hoàn tất", "Rollout firmware Node 1.8.0 hoàn tất cho 15 thiết bị", "OTA_COMPLETED", "success", "admin", null, 3),
  notif(5, "Yêu cầu cấp quyền hỗ trợ", "Operator02 yêu cầu truy cập Nhà Quận 10", "ACCESS_REQUEST", "warning", "admin", 4, 5),
  notif(6, "Đăng nhập bất thường", "3 lần đăng nhập sai liên tiếp cho operator02", "LOGIN_FAILED", "critical", "admin", null, 6),
  notif(7, "Ticket hỗ trợ mới", "Khách hàng Nhà Quận 7 báo mất kết nối", "SUPPORT_TICKET", "warning", "operator", 2, 0.5, true),
  notif(8, "Quyền truy cập sắp hết hạn", "Quyền hỗ trợ Nhà Bình Thạnh hết hạn trong 12 giờ", "ACCESS_EXPIRING", "info", "operator", 3, 2, true),
  notif(9, "Kit sẵn sàng xuất kho", "Kit KIT_B #0006 đã sẵn sàng bán (Ready to sell)", "PROVISION_READY", "success", "operator", 6, 8, true),
  notif(10, "Cảnh báo bảo mật", "Phát hiện REPLAY_ATTACK trên thiết bị ESP32-SN-0013", "SECURITY_ALERT", "critical", "admin", 3, 10),
];

// ---------------------------------------------------------------------------
// Staff accounts (Team & Roles) — mock-only; NOT the real logged-in session.
// ---------------------------------------------------------------------------
export const staffAccounts: StaffAccount[] = [
  { id: 1, username: "admin", role: "admin", created_at: iso(now() - 200 * DAY), last_login: iso(now() - 30 * 60 * 1000) },
  { id: 2, username: "operator01", role: "operator", created_at: iso(now() - 150 * DAY), last_login: iso(now() - 2 * HOUR) },
  { id: 3, username: "operator02", role: "operator", created_at: iso(now() - 90 * DAY), last_login: iso(now() - 6 * HOUR) },
];
