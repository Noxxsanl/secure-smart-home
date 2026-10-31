// Đọc automation_rules phía khách (CONTRACT §1.2): JOIN tên nhà/phòng/thiết bị/người tạo và các kiểm tra tồn tại
// trên bảng module khác. Mọi truy vấn lọc theo home_id.
import { queryOne, queryRows, type Queryable } from "../../../infrastructure/database/db";
import type { RuleRow } from "../domain/customer-rule.mapper";

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
