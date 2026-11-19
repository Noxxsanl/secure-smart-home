// Dòng automation_rules (JOIN tên nhà/phòng/thiết bị/người tạo) → AutomationRuleDto của Dashboard.
import { toBool, toIso, toIsoRequired, toNumberOrNull } from "../../../infrastructure/database/db";
import type { AutomationRuleDto } from "./console-automation.types";

export interface ConsoleRuleRow {
  id: number;
  home_id: number;
  home_name: string;
  name: string;
  is_enabled: boolean;
  trigger_type: "sensor_threshold" | "schedule";
  condition_room_id: number | null;
  room_name: string | null;
  condition_sensor_type: "TEMPERATURE" | "HUMIDITY" | null;
  condition_operator: ">" | "<" | "=" | null;
  condition_threshold_value: string | number | null;
  schedule_time_of_day: string | null;
  schedule_days_of_week: string | null;
  action_device_id: number | null;
  action_device_name: string | null;
  action_command: "turn_on" | "turn_off";
  origin: "user" | "ai_suggested";
  created_by: number | null;
  created_by_name: string | null;
  last_triggered_at: Date | null;
  created_at: Date;
}

function parseDays(csv: string | null): number[] | null {
  if (!csv) return null;
  const days = csv
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return days.length > 0 ? days : null;
}

/** `canEdit` = ADMIN; console không xoá rule (can_delete luôn false). */
export function toConsoleRuleDto(row: ConsoleRuleRow, canEdit: boolean): AutomationRuleDto {
  return {
    id: row.id,
    home_id: row.home_id,
    home_name: row.home_name,
    name: row.name,
    enabled: toBool(row.is_enabled),
    trigger_type: row.trigger_type,
    trigger_room_id: row.condition_room_id,
    trigger_room_name: row.room_name,
    trigger_metric: row.condition_sensor_type === null ? null : row.condition_sensor_type === "TEMPERATURE" ? "temperature" : "humidity",
    trigger_operator: row.condition_operator,
    trigger_threshold: toNumberOrNull(row.condition_threshold_value),
    schedule_time: row.schedule_time_of_day,
    schedule_days: parseDays(row.schedule_days_of_week),
    action_device_id: row.action_device_id,
    action_device_name: row.action_device_name,
    action_command: row.action_command,
    origin: row.origin,
    created_by_user_id: row.created_by,
    created_by_name: row.created_by_name,
    last_triggered_at: toIso(row.last_triggered_at),
    created_at: toIsoRequired(row.created_at),
    can_edit: canEdit,
    can_delete: false,
  };
}
