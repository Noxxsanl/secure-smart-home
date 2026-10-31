// SQL đếm/xoá trên audit_log (bảng của module audit). Truy vấn có JOIN sang bảng module khác nằm ở logs.read-model.ts.
import pool from "../../../infrastructure/database/pool";
import { placeholders, queryOne, runSql, toCount } from "../../../infrastructure/database/db";
import type { Severity } from "../../../shared/types/domain";
import type { LogCategory } from "../domain/event-catalog";

/** Đếm log theo category + severity từ mốc `since` (alerts_to_handle, open_alerts). */
export async function countLogs(categories: readonly LogCategory[], severities: readonly Severity[], since: Date): Promise<number> {
  const row = await queryOne<{ total: unknown }>(
    `SELECT COUNT(*) AS total FROM audit_log
      WHERE category IN (${placeholders(categories.length)}) AND severity IN (${placeholders(severities.length)}) AND created_at >= ?`,
    [...categories, ...severities, since]
  );
  return toCount(row?.total);
}

/** Xoá theo id trong đúng category; không bao giờ xoá dòng LOGS_DELETED (bằng chứng của chính việc xoá). */
export async function deleteLogsByIds(category: LogCategory, ids: readonly number[]): Promise<number> {
  const result = await runSql(
    `DELETE FROM audit_log WHERE category = ? AND event_type <> 'LOGS_DELETED' AND id IN (${placeholders(ids.length)})`,
    [category, ...ids],
    pool
  );
  return result.affectedRows;
}
