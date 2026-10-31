// Dòng automation_rules (JOIN tên nhà/phòng/thiết bị/người tạo) → AutomationRule của khách.
import { toBool, toIso, toIsoRequired, toNumberOrNull } from "../../../infrastructure/database/db";
import { canEditRule } from "../../homes";
import type { HomeAccess } from "../../homes";
import type { AutomationRule, Metric } from "./automation.types";

export interface RuleRow {
  id: number;
  home_id: number;
  home_name: string;
  name: string;
  trigger_type: "sensor_threshold" | "schedule";
  is_enabled: boolean;
  condition_room_id: number | null;
  condition_room_name: string | null;
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

export const METRIC_TO_SQL: Record<Metric, "TEMPERATURE" | "HUMIDITY"> = { temperature: "TEMPERATURE", humidity: "HUMIDITY" };
export const SQL_TO_METRIC: Record<"TEMPERATURE" | "HUMIDITY", Metric> = { TEMPERATURE: "temperature", HUMIDITY: "humidity" };

export function toRuleDto(row: RuleRow, access: Pick<HomeAccess, "permissions">, userId: number): AutomationRule {
  const editable = canEditRule(access, row.created_by, userId);
  const days = row.schedule_days_of_week
    ? row.schedule_days_of_week
        .split(",")
        .map((part) => Number(part))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    : null;
  return {
    id: row.id,
    home_id: row.home_id,
    home_name: row.home_name,
    name: row.name,
    enabled: toBool(row.is_enabled),
    trigger_type: row.trigger_type,
    trigger_room_id: row.condition_room_id,
    trigger_room_name: row.condition_room_name,
    trigger_metric: row.condition_sensor_type ? SQL_TO_METRIC[row.condition_sensor_type] : null,
    trigger_operator: row.condition_operator,
    trigger_threshold: toNumberOrNull(row.condition_threshold_value),
    schedule_time: row.schedule_time_of_day,
    schedule_days: days,
    action_device_id: row.action_device_id,
    action_device_name: row.action_device_name,
    action_command: row.action_command,
    origin: row.origin,
    created_by_user_id: row.created_by,
    created_by_name: row.created_by_name,
    last_triggered_at: toIso(row.last_triggered_at),
    created_at: toIsoRequired(row.created_at),
    can_edit: editable,
    can_delete: editable,
  };
}
