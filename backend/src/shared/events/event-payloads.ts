// Payload DTO dùng chung giữa module PHÁT và module NGHE sự kiện (event-bus.ts) — hợp đồng giữa các module,
// nên nằm ở shared thay vì module devices/notifications. Module chủ sở hữu re-export lại cho API của mình.
import type { DeviceStatus, Severity } from "../types/domain";

/** Số đo mới nhất của một thiết bị (CONTRACT §3 Reading). */
export interface Reading {
  temperature: number | null;
  humidity: number | null;
  door_open: boolean | null;
  received_at: string;
}

/** Trạng thái thiết bị gửi qua bus/WebSocket `device_state` (CONTRACT §4.3, §6). */
export interface DeviceStateSnapshot {
  id: number;
  room_id: number | null;
  online: boolean;
  last_seen: string | null;
  power: boolean | null;
  status: DeviceStatus;
  /** Nhiệt độ đặt của điều hoà (16..30); null với thiết bị khác hoặc khi chưa biết. */
  ac_setpoint: number | null;
  /** Bitmask mã IR điều hoà đã học (bit 0 = TẮT, bit t−15 = BẬT ở t°C); null khi chưa học hoặc không phải điều hoà. */
  ac_codes: number | null;
  /** Rèm: % mở (0 = đóng, 100 = mở hết); null khi chưa biết hoặc không phải rèm. */
  curtain_pos: number | null;
}

export interface CustomerNotification {
  id: number;
  home_id: number | null;
  home_name: string | null;
  type: string;
  title: string;
  message: string;
  severity: Severity;
  is_read: boolean;
  created_at: string;
}

/** Trạng thái tải (đèn/quạt/rèm/điều hoà) trước hoặc sau một lần đổi; level = % mở rèm hoặc nhiệt độ đặt điều hoà, null = không áp dụng/chưa biết. */
export interface ApplianceLoadState {
  power: boolean | null;
  level: number | null;
}

/** Nhiệt độ/độ ẩm do Node báo trong chính gói telemetry đã làm đổi trạng thái (null = gói không có). */
export interface ApplianceClimate {
  temperature: number | null;
  humidity: number | null;
}

/**
 * Trạng thái một tải thật của Node đổi, thấy qua telemetry (bấm trên màn hình Gateway/Node đi thẳng ESP-NOW nên server
 * chỉ biết sau ~1 s; hoặc telemetry về trước ack của lệnh server). Phát từ devices/domain/appliance-sync, nghe ở
 * control (ghi user_behavior_logs).
 */
export interface ApplianceChange {
  device_id: number;
  home_id: number;
  room_id: number | null;
  appliance: "lamp" | "fan" | "curtain" | "ac";
  is_simulated: boolean;
  before: ApplianceLoadState;
  after: ApplianceLoadState;
  /** Thời điểm server nhận telemetry (ISO). */
  at: string;
  climate: ApplianceClimate | null;
}

/** Tóm tắt một ảnh chụp camera gửi qua bus/WebSocket `camera_snapshot` và API danh sách ảnh (không lộ khoá lưu trữ). */
export interface CameraSnapshotSummary {
  id: number;
  trigger: "motion" | "request";
  size_bytes: number;
  captured_at: string;
}
