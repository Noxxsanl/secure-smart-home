// SQL của automation_rules + automation_history (CONTRACT §1.2). Mọi truy vấn lọc theo home_id.
import { queryOne, queryRows, runSql, sqlLimit, type Queryable, type SqlParam } from "../../../lib/db";

export interface RuleRow {
  id: number;
  home_id: number;
  home_name: string;
  name: string;
  trigger_type: "sensor_threshold" | "schedule";
  is_enabled: number;
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

const RULE_SELECT_SQL = `
  SELECT ar.id, ar.home_id, h.name AS home_name, ar.name, ar.trigger_type, ar.is_enabled,
         ar.condition_room_id, r.name AS condition_room_name, ar.condition_sensor_type, ar.condition_operator,
         ar.condition_threshold_value, ar.schedule_time_of_day, ar.schedule_days_of_week,
         ar.action_device_id, d.device_name AS action_device_name, ar.action_command, ar.origin,
         ar.created_by, COALESCE(c.full_name, u.full_name, u.username) AS created_by_name,
         ar.last_triggered_at, ar.created_at
    FROM automation_rules ar
    JOIN smart_homes h ON h.id = ar.home_id
    LEFT JOIN rooms r ON r.id = ar.condition_room_id
    LEFT JOIN devices d ON d.id = ar.action_device_id
    LEFT JOIN users u ON u.id = ar.created_by
    LEFT JOIN customers c ON c.user_id = ar.created_by`;

export async function listRules(homeId: number): Promise<RuleRow[]> {
  return queryRows<RuleRow>(`${RULE_SELECT_SQL} WHERE ar.home_id = ? ORDER BY ar.created_at DESC, ar.id DESC`, [homeId]);
}

export async function getRule(ruleId: number, db?: Queryable): Promise<RuleRow | null> {
  return queryOne<RuleRow>(`${RULE_SELECT_SQL} WHERE ar.id = ?`, [ruleId], db);
}

/** Phòng thuộc nhà và có ≥ 1 cảm biến khí hậu (category 'sensor'). */
export async function roomHasSensor(homeId: number, roomId: number): Promise<boolean | null> {
  const room = await queryOne<{ id: number }>("SELECT id FROM rooms WHERE id = ? AND home_id = ?", [roomId, homeId]);
  if (!room) return null;
  const sensor = await queryOne<{ id: number }>(
    "SELECT id FROM devices WHERE home_id = ? AND room_id = ? AND category = 'sensor' LIMIT 1",
    [homeId, roomId]
  );
  return sensor !== null;
}

/** Thiết bị hành động phải là relay thuộc nhà. */
export async function findRelayOfHome(homeId: number, deviceId: number): Promise<{ id: number } | null> {
  return queryOne<{ id: number }>(
    "SELECT id FROM devices WHERE id = ? AND home_id = ? AND category = 'relay' AND device_type <> 'gateway'",
    [deviceId, homeId]
  );
}

export interface RuleWrite {
  name: string;
  triggerType: "sensor_threshold" | "schedule";
  enabled: boolean;
  roomId: number | null;
  sensorType: "TEMPERATURE" | "HUMIDITY" | null;
  operator: ">" | "<" | "=" | null;
  threshold: number | null;
  scheduleTime: string | null;
  scheduleDays: string | null;
  actionDeviceId: number;
  actionCommand: "turn_on" | "turn_off";
}

export async function insertRule(
  db: Queryable,
  input: RuleWrite & { homeId: number; createdBy: number; origin: "user" | "ai_suggested"; recommendationId?: number }
): Promise<number> {
  const result = await runSql(
    `INSERT INTO automation_rules
       (home_id, name, trigger_type, is_enabled, condition_room_id, condition_sensor_type, condition_operator,
        condition_threshold_value, schedule_time_of_day, schedule_days_of_week, action_device_id, action_command,
        origin, source_recommendation_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.homeId,
      input.name,
      input.triggerType,
      input.enabled ? 1 : 0,
      input.roomId,
      input.sensorType,
      input.operator,
      input.threshold,
      input.scheduleTime,
      input.scheduleDays,
      input.actionDeviceId,
      input.actionCommand,
      input.origin,
      input.recommendationId ?? null,
      input.createdBy,
    ],
    db
  );
  return result.insertId;
}

/** Ghi đè toàn bộ trường của rule; đổi điều kiện thì reset trạng thái cạnh (last_condition_state). */
export async function updateRule(ruleId: number, input: RuleWrite): Promise<void> {
  await runSql(
    `UPDATE automation_rules
        SET name = ?, trigger_type = ?, is_enabled = ?, condition_room_id = ?, condition_sensor_type = ?,
            condition_operator = ?, condition_threshold_value = ?, schedule_time_of_day = ?,
            schedule_days_of_week = ?, action_device_id = ?, action_command = ?, last_condition_state = NULL
      WHERE id = ?`,
    [
      input.name,
      input.triggerType,
      input.enabled ? 1 : 0,
      input.roomId,
      input.sensorType,
      input.operator,
      input.threshold,
      input.scheduleTime,
      input.scheduleDays,
      input.actionDeviceId,
      input.actionCommand,
      ruleId,
    ]
  );
}

export async function deleteRule(ruleId: number): Promise<void> {
  await runSql("DELETE FROM automation_rules WHERE id = ?", [ruleId]);
}

export interface HistoryRow {
  id: number;
  triggered_at: Date;
  result: "success" | "failed" | "skipped";
  details: unknown;
}

export async function listHistory(ruleId: number, limit: number): Promise<HistoryRow[]> {
  const params: SqlParam[] = [ruleId, sqlLimit(limit)];
  return queryRows<HistoryRow>(
    `SELECT id, triggered_at, result, details FROM automation_history
      WHERE rule_id = ? ORDER BY triggered_at DESC, id DESC LIMIT ?`,
    params
  );
}
