// Kiểu của nhật ký hành vi (user_behavior_logs, FR-7.3) — dùng bởi lệnh điều khiển và repository ghi log.
import type { Appliance } from "../../devices";

export type BehaviorAction = "TURN_ON" | "TURN_OFF" | "SET_TEMP" | "SET_POS";
/**
 * Nguồn hành động (CONTRACT §1.2): app mobile → 'mobile'; portal web → 'manual'; rule → 'automation';
 * rule sinh từ gợi ý đã chấp nhận → 'ai_suggested'; console nhân viên → 'dashboard'; bấm tại chỗ trên màn hình
 * Gateway/Node hoặc remote (server chỉ thấy qua telemetry) → 'local'; lệnh do hẹn giờ một lần chạy → 'schedule';
 * lệnh/lịch do Trợ lý AI tạo → 'ai_agent'.
 */
export type BehaviorSource = "manual" | "automation" | "voice" | "mobile" | "dashboard" | "ai_suggested" | "local" | "schedule" | "ai_agent";

/**
 * Trạng thái tải tại một thời điểm: power = bật/tắt (rèm: đang mở?), level = % mở rèm (curtain_pos) hoặc nhiệt độ đặt
 * điều hoà (ac_setpoint); đèn/quạt không có level (null). null = chưa biết.
 */
export interface LoadState {
  power: boolean | null;
  level: number | null;
}

/** Loại tải ghi vào user_behavior_logs.appliance (null = relay chưa gán loại). */
export type BehaviorAppliance = Appliance | null;
