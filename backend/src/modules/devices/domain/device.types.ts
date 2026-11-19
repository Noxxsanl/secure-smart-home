// Kiểu dữ liệu của domain thiết bị (CONTRACT_V2 §3, §5): row đọc từ DB và các DTO trả cho
// Customer API (mobile/portal) và Dashboard API (console). Không chứa secret_key — cột đó
// không bao giờ được SELECT ra ngoài infrastructure/device-secret.repository (HMAC + ký lệnh gateway).
import type { DeviceCategory, DeviceStatus, HomeStatus } from "../../../shared/types/domain";
import type { DeviceStateSnapshot, Reading } from "../../../shared/events/event-payloads";

// Reading, DeviceStateSnapshot là payload sự kiện bus — định nghĩa ở shared/events, re-export cho API của module.
export type { DeviceStateSnapshot, Reading };

export type ProvisionStatus = "pending" | "provisioned";
/** Lệnh bật/tắt relay (device_commands.command). */
export type DeviceAction = "turn_on" | "turn_off";
/** Đặt nhiệt độ điều hoà: chuỗi lưu ở device_commands.command và gửi xuống gateway, VD `set_temp_24`. */
export type SetTempAction = `set_temp_${number}`;
/** Học mã IR remote điều hoà: `learn_off` (mã TẮT) hoặc `learn_t<NN>` (mã BẬT ở NN°C, VD `learn_t24`). */
export type LearnAction = "learn_off" | `learn_t${number}`;
/** Mở rèm tới N % (0 = đóng): chuỗi lưu ở device_commands.command và gửi xuống gateway/Node, VD `set_pos_50`. */
export type SetPosAction = `set_pos_${number}`;
/** Mọi lệnh gửi tới một relay (bật/tắt + đặt nhiệt độ + học mã IR của điều hoà + mở rèm tới N %). */
export type DeviceCommandAction = DeviceAction | SetTempAction | LearnAction | SetPosAction;
/** devices.appliance — loại đồ gia dụng mà một relay của Node phòng khách đại diện (NULL = relay thường). */
export type Appliance = "lamp" | "fan" | "curtain" | "ac";
/** Lệnh quản trị gateway (CONTRACT §5 Gateways). */
export type GatewayAction = "restart" | "factory_reset";

/**
 * Một dòng `devices` đã join home/room/gateway (xem DEVICE_SELECT_SQL). `device_type` vẫn
 * là 'sensor' | 'gateway' (danh tính node cho HMAC); loại chức năng nằm ở `category`.
 * BOOLEAN pg đọc ra là true/false — dùng toBool() khi map sang DTO.
 */
export interface DeviceRow {
  id: number;
  /** UID thiết bị (cột devices.device_id) — ví dụ ESP32-RL-3FA9C01B7D22. */
  device_id: string;
  device_name: string;
  device_type: "sensor" | "gateway";
  category: DeviceCategory;
  status: DeviceStatus;
  location: string | null;
  fail_count: number;
  last_seen: Date | null;
  last_ip: string | null;
  created_at: Date;
  home_id: number | null;
  room_id: number | null;
  gateway_device_id: number | null;
  node_uid: string | null;
  power_state: boolean | null;
  firmware_version: string | null;
  rssi: number | null;
  wifi_ssid: string | null;
  provision_status: ProvisionStatus;
  is_simulated: boolean;
  sim_online: boolean;
  appliance: Appliance | null;
  /** Nhiệt độ đặt của điều hoà (16..30); NULL khi chưa biết hoặc không phải điều hoà. */
  ac_setpoint: number | null;
  /** Bitmask mã IR điều hoà đã học (bit 0 = TẮT, bit t−15 = BẬT ở t°C); NULL = chưa học/chưa biết. */
  ac_codes: number | null;
  /** Rèm: % mở (0 = đóng, 100 = mở hết); NULL khi chưa biết hoặc không phải rèm. */
  curtain_pos: number | null;
  // ── cột join ──
  home_name: string | null;
  home_status: HomeStatus | null;
  home_timezone: string | null;
  room_name: string | null;
  /** UID của gateway mà node này thuộc về (NULL với chính dòng gateway). */
  gateway_uid: string | null;
}

/** Thiết bị theo góc nhìn khách hàng (mobile/portal). */
export interface CustomerDevice {
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
  /** Chỉ relay mới có; loại khác luôn null. */
  power: boolean | null;
  latest: Reading | null;
  /** relay && role cho phép — không phụ thuộc online. */
  can_control: boolean;
  /** Đồ gia dụng của relay (đèn/quạt/rèm/điều hoà); null với thiết bị khác. */
  appliance: Appliance | null;
  /** Nhiệt độ đặt của điều hoà (16..30); null khi chưa biết hoặc không phải điều hoà. */
  ac_setpoint: number | null;
  /** Bitmask mã IR điều hoà đã học (bit 0 = TẮT, bit t−15 = BẬT ở t°C); null khi chưa học hoặc không phải điều hoà. */
  ac_codes: number | null;
  /** Rèm: % mở (0 = đóng, 100 = mở hết); null khi chưa biết hoặc không phải rèm. */
  curtain_pos: number | null;
}

/** Thiết bị theo góc nhìn console (ADMIN/OPERATOR). */
export interface ConsoleDevice {
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
}

/** Số liệu tổng hợp của một gateway (xem getGatewayCounts). */
export interface GatewayCounts {
  /** Số node_uid khác nhau trong các thiết bị của gateway. */
  node_count: number;
  /** Số node có ≥ 1 thiết bị đã từng được thấy (last_seen không null). */
  paired_count: number;
  device_count: number;
}

export interface Gateway {
  id: number;
  uid: string;
  home_id: number | null;
  home_name: string | null;
  status: "online" | "offline";
  device_status: DeviceStatus;
  firmware_version: string | null;
  wifi_ssid: string | null;
  rssi: number | null;
  /** = online (chưa có kênh MQTT presence riêng). */
  mqtt_status: "connected" | "disconnected";
  last_seen: string | null;
  last_ip: string | null;
  provision_status: ProvisionStatus;
  node_count: number;
  paired_count: number;
  device_count: number;
  is_simulated: boolean;
  created_at: string;
}
