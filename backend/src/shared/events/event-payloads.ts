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
