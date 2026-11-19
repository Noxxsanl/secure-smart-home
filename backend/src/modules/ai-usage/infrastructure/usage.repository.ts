// SQL ghi ai_usage_logs + tính chi phí theo ai_model_prices (cả hai bảng thuộc module ai-usage).
import { placeholders, queryRows, runSql, type Queryable, type SqlParam } from "../../../infrastructure/database/db";
import type { UsageRecordInput } from "../domain/usage.types";
import { modelMatchSql } from "./model-match";

const INSERT_COLUMNS = [
  "provider", "model", "purpose", "source", "status", "error_code",
  "input_tokens", "cached_input_tokens", "cache_write_tokens", "output_tokens", "reasoning_tokens",
  "audio_seconds", "latency_ms", "ttft_ms", "home_id", "user_id", "request_id", "round_index", "occurred_at",
] as const;

function toRow(record: UsageRecordInput): SqlParam[] {
  return [
    record.provider, record.model, record.purpose, record.source, record.status, record.errorCode,
    record.inputTokens, record.cachedInputTokens, record.cacheWriteTokens, record.outputTokens, record.reasoningTokens,
    record.audioSeconds, record.latencyMs, record.ttftMs, record.homeId, record.userId, record.requestId,
    record.roundIndex, record.occurredAt,
  ];
}

export async function insertUsageRecords(db: Queryable, records: readonly UsageRecordInput[]): Promise<number[]> {
  if (records.length === 0) return [];
  const tuple = `(${placeholders(INSERT_COLUMNS.length)})`;
  const rows = await queryRows<{ id: string | number }>(
    `INSERT INTO ai_usage_logs (${INSERT_COLUMNS.join(", ")})
     VALUES ${records.map(() => tuple).join(", ")}
     RETURNING id`,
    records.flatMap(toRow),
    db
  );
  return rows.map((row) => Number(row.id));
}

// Chi phí một dòng log `l` theo giá `p` (USD). Giá khớp: cùng provider và model trùng tên, hoặc log ghi bản có ngày
// ("gpt-5-mini-2025-08-07", "claude-haiku-4-5-20251001") → chọn giá có tên dài nhất. Không có giá → NULL.
//   STT tính theo phút khi lượt gọi không có token (whisper-1) — lượt STT lỗi không tính tiền; còn lại theo token:
//   (vào − cache đọc − cache ghi) × giá vào + cache đọc × giá cache (thiếu thì giá vào) + cache ghi × giá ghi + ra × giá ra
const COST_OF_ROW_SQL = `(
  SELECT CASE
    WHEN l.audio_seconds IS NOT NULL AND l.input_tokens = 0 AND l.output_tokens = 0
      THEN CASE WHEN l.status = 'success' THEN l.audio_seconds / 60.0 * p.audio_usd_per_minute ELSE 0 END
    WHEN p.input_usd_per_mtok IS NULL OR p.output_usd_per_mtok IS NULL THEN NULL
    ELSE (
        GREATEST(l.input_tokens - l.cached_input_tokens - l.cache_write_tokens, 0) * p.input_usd_per_mtok
      + l.cached_input_tokens * COALESCE(p.cached_input_usd_per_mtok, p.input_usd_per_mtok)
      + l.cache_write_tokens * COALESCE(p.cache_write_usd_per_mtok, p.input_usd_per_mtok)
      + l.output_tokens * p.output_usd_per_mtok
    ) / 1000000.0
  END
  FROM ai_model_prices p
  WHERE p.provider = l.provider AND ${modelMatchSql("p.model", "l.model")}
  ORDER BY LENGTH(p.model) DESC
  LIMIT 1
)`;

/** Tính chi phí cho các dòng vừa ghi (giá tại thời điểm ghi — đổi giá sau không làm đổi chi phí cũ). */
export async function applyCosts(db: Queryable, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) return;
  await runSql(
    `UPDATE ai_usage_logs l SET cost_usd = ${COST_OF_ROW_SQL} WHERE l.id IN (${placeholders(ids.length)})`,
    [...ids],
    db
  );
}

/** Có giá mới cho model: tính bù cho các lượt trước đó chưa có giá (cost_usd NULL). Trả số dòng đã tính. */
export async function backfillMissingCosts(db: Queryable, provider: string, model: string): Promise<number> {
  const result = await runSql(
    `UPDATE ai_usage_logs l SET cost_usd = ${COST_OF_ROW_SQL}
      WHERE l.cost_usd IS NULL AND l.provider = ? AND ${modelMatchSql("?::text", "l.model")}`,
    [provider, model, model],
    db
  );
  return result.affectedRows;
}
