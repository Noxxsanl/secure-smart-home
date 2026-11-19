import { toIso, toIsoRequired } from "../../../infrastructure/database/db";
import type { HabitSuggestion, SuggestionRow } from "./suggestion.types";

export function toSuggestion(row: SuggestionRow): HabitSuggestion {
  return {
    id: row.id,
    home_id: row.home_id,
    device_id: row.device_id,
    device_name: row.device_name ?? "",
    room_name: row.room_name,
    action: row.action,
    time_of_day: row.time_of_day,
    days_matched: row.days_matched,
    window_days: row.window_days,
    // confirmed → accepted; rejected/expired → dismissed
    status: row.status === "pending" ? "pending" : row.status === "confirmed" ? "accepted" : "dismissed",
    created_at: toIsoRequired(row.presented_at),
    responded_at: toIso(row.responded_at),
    rule_id: row.created_rule_id,
  };
}
