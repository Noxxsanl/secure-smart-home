// SQL ghi recommendation_history + user_feedback, và các đọc thuần trên bảng của module (habit job dùng).
// Đọc có JOIN sang bảng module khác nằm ở *.read-model.ts.
import { queryOne, queryRows, runSql, type Queryable } from "../../../infrastructure/database/db";

/** Khoá dòng gợi ý trong transaction để hai phản hồi đồng thời không cùng thắng. */
export async function lockSuggestionStatus(db: Queryable, id: number): Promise<{ status: string } | null> {
  return queryOne<{ status: string }>("SELECT status FROM recommendation_history WHERE id = ? FOR UPDATE", [id], db);
}

export async function markConfirmed(db: Queryable, id: number, userId: number, ruleId: number): Promise<void> {
  await runSql(
    `UPDATE recommendation_history
        SET status = 'confirmed', responded_at = NOW(), responded_by = ?, created_rule_id = ?
      WHERE id = ?`,
    [userId, ruleId, id],
    db
  );
}

export async function markRejected(db: Queryable, id: number, userId: number): Promise<void> {
  await runSql(
    "UPDATE recommendation_history SET status = 'rejected', responded_at = NOW(), responded_by = ? WHERE id = ?",
    [userId, id],
    db
  );
}

export async function insertFeedback(
  db: Queryable,
  recommendationId: number,
  userId: number,
  type: "accepted" | "rejected",
  reason: string | null
): Promise<void> {
  await runSql(
    "INSERT INTO user_feedback (recommendation_id, user_id, feedback_type, reason) VALUES (?, ?, ?, ?)",
    [recommendationId, userId, type, reason],
    db
  );
}

// ── Habit job ──────────────────────────────────────────────────────────────

/** Có gợi ý nào của nhà được trình bày từ `since` không (tính MỌI trạng thái). */
export async function hasSuggestionSince(homeId: number, since: Date): Promise<boolean> {
  const recent = await queryRows<{ id: number }>(
    "SELECT id FROM recommendation_history WHERE home_id = ? AND presented_at >= ? LIMIT 1",
    [homeId, since]
  );
  return recent.length > 0;
}

/** Gợi ý pending/confirmed/rejected của cùng thiết bị + hành động (để loại gợi ý trùng giờ). */
export async function listBlockingSuggestions(
  homeId: number,
  deviceId: number,
  action: "turn_on" | "turn_off"
): Promise<{ time_of_day: string; status: string; ref_at: Date }[]> {
  return queryRows<{ time_of_day: string; status: string; ref_at: Date }>(
    `SELECT time_of_day, status, COALESCE(responded_at, presented_at) AS ref_at
       FROM recommendation_history
      WHERE home_id = ? AND device_id = ? AND action = ? AND status IN ('pending', 'confirmed', 'rejected')`,
    [homeId, deviceId, action]
  );
}

export async function insertSuggestion(input: {
  homeId: number;
  deviceId: number;
  action: "turn_on" | "turn_off";
  timeOfDay: string;
  daysMatched: number;
  windowDays: number;
  config: Record<string, unknown>;
}): Promise<number> {
  const result = await runSql(
    `INSERT INTO recommendation_history
       (home_id, device_id, action, time_of_day, days_matched, window_days, suggested_rule_config, status, presented_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
     RETURNING id`,
    [input.homeId, input.deviceId, input.action, input.timeOfDay, input.daysMatched, input.windowDays, JSON.stringify(input.config), new Date()]
  );
  return result.insertId;
}
