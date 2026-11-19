// Đọc rule cho automation engine: rule đang bật của nhà 'active' kèm múi giờ nhà và tên thiết bị hành động.
import { queryRows } from "../../../infrastructure/database/db";

export interface EngineRuleRow {
  id: number;
  home_id: number;
  name: string;
  trigger_type: "sensor_threshold" | "schedule";
  condition_sensor_type: "TEMPERATURE" | "HUMIDITY" | null;
  condition_operator: ">" | "<" | "=" | null;
  condition_threshold_value: string | number | null;
  schedule_time_of_day: string | null;
  schedule_days_of_week: string | null;
  action_device_id: number | null;
  action_command: "turn_on" | "turn_off";
  origin: "user" | "ai_suggested";
  last_condition_state: boolean | null;
  last_triggered_at: Date | null;
  timezone: string;
  action_device_name: string | null;
}

// Chỉ nhà 'active' mới chạy rule (suspended: khoá điều khiển; unclaimed: chưa có chủ)
const RULE_SELECT_SQL = `
  SELECT r.id, r.home_id, r.name, r.trigger_type, r.condition_sensor_type, r.condition_operator,
         r.condition_threshold_value, r.schedule_time_of_day, r.schedule_days_of_week,
         r.action_device_id, r.action_command, r.origin, r.last_condition_state, r.last_triggered_at,
         h.timezone, d.device_name AS action_device_name
    FROM automation_rules r
    JOIN smart_homes h ON h.id = r.home_id
    LEFT JOIN devices d ON d.id = r.action_device_id AND d.home_id = r.home_id
   WHERE r.is_enabled = TRUE AND h.status = 'active' AND r.trigger_type = ?`;

/** Rule sensor_threshold đang bật của đúng phòng đã phát số đo. */
export async function listSensorRulesOfRoom(homeId: number, roomId: number): Promise<EngineRuleRow[]> {
  return queryRows<EngineRuleRow>(`${RULE_SELECT_SQL} AND r.home_id = ? AND r.condition_room_id = ?`, [
    "sensor_threshold",
    homeId,
    roomId,
  ]);
}

/** Mọi rule schedule đang bật (engine tự so khớp HH:MM + thứ theo múi giờ của từng nhà). */
export async function listScheduleRules(): Promise<EngineRuleRow[]> {
  return queryRows<EngineRuleRow>(RULE_SELECT_SQL, ["schedule"]);
}
