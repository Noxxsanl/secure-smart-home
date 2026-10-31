// Kiểu của nhật ký hành vi (user_behavior_logs, FR-7.3) — dùng bởi lệnh điều khiển và repository ghi log.

export type BehaviorAction = "TURN_ON" | "TURN_OFF";
/**
 * Nguồn hành động (CONTRACT §1.2): app mobile → 'mobile'; portal web → 'manual'; rule → 'automation';
 * rule sinh từ gợi ý đã chấp nhận → 'ai_suggested'; console nhân viên → 'dashboard'.
 */
export type BehaviorSource = "manual" | "automation" | "voice" | "mobile" | "dashboard" | "ai_suggested";
