// SQL gợi ý thói quen (recommendation_history + user_feedback). Trạng thái DB: pending/confirmed/rejected/expired.
import { queryOne, queryRows, runSql, type Queryable } from "../../../lib/db";

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

const SUGGESTION_SELECT_SQL = `
  SELECT rh.id, rh.home_id, rh.device_id, d.device_name, r.name AS room_name, rh.action, rh.time_of_day,
         rh.days_matched, rh.window_days, rh.status, rh.presented_at, rh.responded_at, rh.created_rule_id
    FROM recommendation_history rh
    LEFT JOIN devices d ON d.id = rh.device_id
    LEFT JOIN rooms r ON r.id = d.room_id`;

/** Đang chờ + đã phản hồi trong 30 ngày gần nhất; chờ trước, mới trước. */
export async function listSuggestions(homeId: number): Promise<SuggestionRow[]> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  return queryRows<SuggestionRow>(
    `${SUGGESTION_SELECT_SQL}
      WHERE rh.home_id = ? AND (rh.status = 'pending' OR rh.responded_at >= ? OR (rh.responded_at IS NULL AND rh.presented_at >= ?))
      ORDER BY (rh.status = 'pending') DESC, rh.presented_at DESC, rh.id DESC`,
    [homeId, since, since]
  );
}

export async function getSuggestion(id: number, db?: Queryable): Promise<SuggestionRow | null> {
  return queryOne<SuggestionRow>(`${SUGGESTION_SELECT_SQL} WHERE rh.id = ?`, [id], db);
}

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
