// Kiểu domain của gợi ý thói quen (FR-7.4 → 7.7). Trạng thái DB: pending/confirmed/rejected/expired;
// DTO trả cho khách gộp thành pending/accepted/dismissed.

export interface SuggestionRow {
  id: number;
  home_id: number;
  device_id: number | null;
  device_name: string | null;
  room_name: string | null;
  action: "turn_on" | "turn_off";
  time_of_day: string;
  days_matched: number;
  window_days: number;
  status: "pending" | "confirmed" | "rejected" | "expired";
  presented_at: Date;
  responded_at: Date | null;
  created_rule_id: number | null;
}

export interface HabitSuggestion {
  id: number;
  home_id: number;
  device_id: number | null;
  device_name: string;
  room_name: string | null;
  action: "turn_on" | "turn_off";
  time_of_day: string;
  days_matched: number;
  window_days: number;
  status: "pending" | "accepted" | "dismissed";
  created_at: string;
  responded_at: string | null;
  rule_id: number | null;
}

/** Kết quả một lần quét của habit job (cũng là response của POST /api/dashboard/ai/suggestions/run). */
export interface HabitRunResult {
  homes_scanned: number;
  suggestions_created: number;
}
