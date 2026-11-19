// Đọc recommendation_history kèm tên thiết bị/phòng (JOIN bảng module khác). Trạng thái DB: pending/confirmed/rejected/expired.
import { queryOne, queryRows, type Queryable } from "../../../infrastructure/database/db";
import type { SuggestionRow } from "../domain/suggestion.types";

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
