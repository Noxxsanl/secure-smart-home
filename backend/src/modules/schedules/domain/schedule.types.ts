// Kiểu của hẹn giờ MỘT LẦN (bảng scheduled_actions) và DTO trả cho Portal/Mobile (hợp đồng giai đoạn 1 §2).
import type { Appliance } from "../../devices";

/** Thao tác khách chọn (dạng đã tách); lưu DB là chuỗi DeviceCommandAction (turn_on | turn_off | set_temp_<NN> | set_pos_<N>). */
export const SCHEDULE_ACTIONS = ["turn_on", "turn_off", "set_temp", "set_pos"] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

export type ScheduleStatus = "scheduled" | "running" | "done" | "skipped" | "failed" | "cancelled" | "missed";
export type ScheduleOrigin = "user" | "ai_agent";
/** scheduled_actions.channel — kênh khách tạo lịch (khớp CustomerChannel). */
export type ScheduleChannel = "web" | "mobile";
export type ScheduleScope = "upcoming" | "history";

/** Thời điểm chạy: ĐÚNG MỘT trong hai dạng (xem resolveWhen). */
export type ScheduleWhen = { at: string; date?: string } | { afterMinutes: number };

/** Input đã kiểm cú pháp (chưa kiểm quyền/thiết bị). */
export interface ScheduleInput {
  deviceId: number;
  action: ScheduleAction;
  temperature: number | null;
  position: number | null;
  when: ScheduleWhen;
}

/** Mã lý do lưu ở scheduled_actions.error_code (failed/skipped/cancelled). */
export type ScheduleErrorCode =
  | "DEVICE_OFFLINE"
  | "TIMEOUT"
  | "COMMAND_FAILED"
  | "DEVICE_BLOCKED"
  | "HOME_SUSPENDED"
  | "NOT_CONTROLLABLE"
  | "NO_DEVICE"
  | "ACCESS_REVOKED"
  | "ALREADY_IN_STATE"
  | "INTERRUPTED"
  | "UNKNOWN";

/** Một dòng scheduled_actions đã JOIN nhà/thiết bị/phòng/người tạo (đủ để dựng DTO và để runner xử lý). */
export interface ScheduleRow {
  id: number;
  home_id: number;
  timezone: string;
  device_id: number | null;
  device_name: string | null;
  appliance: Appliance | null;
  room_name: string | null;
  /** Chuỗi DeviceCommandAction đã lưu. */
  action: string;
  run_at: Date;
  status: ScheduleStatus;
  origin: ScheduleOrigin;
  channel: ScheduleChannel;
  created_by_user_id: number | null;
  created_by_name: string | null;
  error_code: string | null;
  executed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

/** Schedule DTO (snake_case) — hợp đồng §2.4. */
export interface Schedule {
  id: number;
  home_id: number;
  timezone: string;
  device_id: number | null;
  device_name: string | null;
  room_name: string | null;
  appliance: Appliance | null;
  action: ScheduleAction;
  temperature: number | null;
  position: number | null;
  action_label: string;
  run_at: string;
  status: ScheduleStatus;
  origin: ScheduleOrigin;
  channel: ScheduleChannel;
  created_by_user_id: number | null;
  created_by_name: string | null;
  error_code: string | null;
  executed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  can_cancel: boolean;
}
