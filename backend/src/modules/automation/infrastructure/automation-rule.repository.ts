// SQL ghi automation_rules + automation_history (CONTRACT §1.2) và các đọc thuần trên bảng của module.
// Phần đọc có JOIN sang bảng module khác nằm ở *.read-model.ts.
import {
  queryRows,
  runSql,
  sqlLimit,
  type Queryable,
  type SqlParam,
} from "../../../infrastructure/database/db";
import { COOLDOWN_SECONDS } from "../domain/engine-policy";
import type { RuleWrite } from "../domain/automation.types";

export async function insertRule(
  db: Queryable,
  input: RuleWrite & { homeId: number; createdBy: number; origin: "user" | "ai_suggested"; recommendationId?: number }
): Promise<number> {
  const result = await runSql(
    `INSERT INTO automation_rules
       (home_id, name, trigger_type, is_enabled, condition_room_id, condition_sensor_type, condition_operator,
        condition_threshold_value, schedule_time_of_day, schedule_days_of_week, action_device_id, action_command,
        origin, source_recommendation_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      input.homeId,
      input.name,
      input.triggerType,
      input.enabled,
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
      input.enabled,
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

/** Bật/tắt rule (console); reset last_condition_state để engine đánh giá lại cạnh lên từ đầu. */
export async function setRuleEnabled(id: number, enabled: boolean): Promise<void> {
  await runSql("UPDATE automation_rules SET is_enabled = ?, last_condition_state = NULL WHERE id = ?", [enabled, id]);
}

/** Giờ của các rule schedule đang bật cho cùng thiết bị + hành động (habit job dùng để không gợi ý trùng rule). */
export async function listEnabledScheduleTimes(homeId: number, deviceId: number, command: "turn_on" | "turn_off"): Promise<{ schedule_time_of_day: string | null }[]> {
  return queryRows<{ schedule_time_of_day: string | null }>(
    `SELECT schedule_time_of_day FROM automation_rules
      WHERE home_id = ? AND is_enabled = TRUE AND trigger_type = 'schedule'
        AND action_device_id = ? AND action_command = ?`,
    [homeId, deviceId, command]
  );
}

// ── Lịch sử ────────────────────────────────────────────────────────────────

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

export async function insertHistory(
  ruleId: number,
  homeId: number,
  result: "success" | "failed" | "skipped",
  details: Record<string, unknown>
): Promise<void> {
  await runSql(
    "INSERT INTO automation_history (rule_id, home_id, triggered_at, result, details) VALUES (?, ?, ?, ?, ?)",
    [ruleId, homeId, new Date(), result, JSON.stringify(details)]
  );
}

// ── Engine: giành quyền chạy bằng UPDATE có điều kiện ──────────────────────

/** Điều kiện hết đúng → "nạp lại" cạnh để lần đúng tiếp theo kích hoạt được. */
export async function resetConditionState(ruleId: number): Promise<void> {
  await runSql("UPDATE automation_rules SET last_condition_state = FALSE WHERE id = ?", [ruleId]);
}

/**
 * Giành quyền chạy rule ngưỡng cảm biến: chỉ khi trước đó chưa đúng (cạnh lên) VÀ đã qua cooldown.
 * Hai số đo đồng thời chỉ một bên thắng (affectedRows = 1).
 */
export async function claimSensorRuleTrigger(ruleId: number): Promise<boolean> {
  const claimed = await runSql(
    `UPDATE automation_rules SET last_condition_state = TRUE, last_triggered_at = NOW()
      WHERE id = ? AND is_enabled = TRUE
        AND (last_condition_state IS NULL OR last_condition_state = FALSE)
        AND (last_triggered_at IS NULL OR last_triggered_at <= NOW() - make_interval(secs => ${COOLDOWN_SECONDS}))`,
    [ruleId]
  );
  return claimed.affectedRows > 0;
}

/** Tối đa 1 lần/phút: chỉ tick nào cập nhật được dòng (last_triggered_at còn trước đầu phút) mới chạy. */
export async function claimScheduleRuleTrigger(ruleId: number, minuteStart: Date): Promise<boolean> {
  const claimed = await runSql(
    `UPDATE automation_rules SET last_triggered_at = NOW()
      WHERE id = ? AND is_enabled = TRUE AND (last_triggered_at IS NULL OR last_triggered_at < ?)`,
    [ruleId, minuteStart]
  );
  return claimed.affectedRows > 0;
}
