// SQL trên ai_model_prices + ai_usage_settings (bảng của module ai-usage).
import pool from "../../../infrastructure/database/pool";
import { queryOne, queryRows, runSql, type Queryable } from "../../../infrastructure/database/db";
import type { ModelPrice, PriceSource, PriceValues, UsageSettings } from "../domain/usage.types";
import { modelMatchSql } from "./model-match";

const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const isoOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : value instanceof Date ? value.toISOString() : String(value);

function toPrice(row: Record<string, unknown>): ModelPrice {
  return {
    id: Number(row.id),
    provider: String(row.provider),
    model: String(row.model),
    input_usd_per_mtok: numOrNull(row.input_usd_per_mtok),
    cached_input_usd_per_mtok: numOrNull(row.cached_input_usd_per_mtok),
    cache_write_usd_per_mtok: numOrNull(row.cache_write_usd_per_mtok),
    output_usd_per_mtok: numOrNull(row.output_usd_per_mtok),
    audio_usd_per_minute: numOrNull(row.audio_usd_per_minute),
    source: String(row.source) as PriceSource,
    source_url: row.source_url === null ? null : String(row.source_url),
    checked_at: isoOrNull(row.checked_at),
    updated_at: isoOrNull(row.updated_at) ?? "",
    calls_30d: Number(row.calls_30d ?? 0),
  };
}

const PRICE_SELECT_SQL = `
  SELECT p.*,
         (SELECT COUNT(*) FROM ai_usage_logs l
           WHERE l.provider = p.provider AND ${modelMatchSql("p.model", "l.model")}
             AND l.occurred_at >= NOW() - INTERVAL '30 days') AS calls_30d
    FROM ai_model_prices p`;

export async function listPrices(): Promise<ModelPrice[]> {
  const rows = await queryRows<Record<string, unknown>>(`${PRICE_SELECT_SQL} ORDER BY p.provider, p.model`);
  return rows.map(toPrice);
}

export async function getPrice(id: number, db: Queryable = pool): Promise<ModelPrice | null> {
  const row = await queryOne<Record<string, unknown>>(`${PRICE_SELECT_SQL} WHERE p.id = ?`, [id], db);
  return row ? toPrice(row) : null;
}

export interface PriceWrite {
  values: PriceValues;
  source: PriceSource;
  sourceUrl: string | null;
  checkedAt: Date | null;
  updatedBy: number | null;
}

/** Thêm giá; đã có (provider, model) → ném lỗi khoá trùng, trừ khi `skipExisting` (trả null). */
export async function insertPrice(
  db: Queryable,
  provider: string,
  model: string,
  write: PriceWrite,
  skipExisting = false
): Promise<number | null> {
  const result = await runSql(
    `INSERT INTO ai_model_prices
       (provider, model, input_usd_per_mtok, cached_input_usd_per_mtok, cache_write_usd_per_mtok, output_usd_per_mtok,
        audio_usd_per_minute, source, source_url, checked_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ${skipExisting ? "ON CONFLICT (provider, model) DO NOTHING" : ""}
     RETURNING id`,
    [
      provider, model,
      write.values.inputUsdPerMtok, write.values.cachedInputUsdPerMtok, write.values.cacheWriteUsdPerMtok,
      write.values.outputUsdPerMtok, write.values.audioUsdPerMinute,
      write.source, write.sourceUrl, write.checkedAt, write.updatedBy,
    ],
    db
  );
  return result.affectedRows > 0 ? result.insertId : null;
}

export async function updatePrice(db: Queryable, id: number, write: PriceWrite): Promise<number> {
  const result = await runSql(
    `UPDATE ai_model_prices
        SET input_usd_per_mtok = ?, cached_input_usd_per_mtok = ?, cache_write_usd_per_mtok = ?,
            output_usd_per_mtok = ?, audio_usd_per_minute = ?, source = ?, source_url = ?, checked_at = ?,
            updated_by = ?
      WHERE id = ?`,
    [
      write.values.inputUsdPerMtok, write.values.cachedInputUsdPerMtok, write.values.cacheWriteUsdPerMtok,
      write.values.outputUsdPerMtok, write.values.audioUsdPerMinute,
      write.source, write.sourceUrl, write.checkedAt, write.updatedBy, id,
    ],
    db
  );
  return result.affectedRows;
}

export async function deletePrice(id: number): Promise<number> {
  return (await runSql("DELETE FROM ai_model_prices WHERE id = ?", [id])).affectedRows;
}

// ── Cài đặt (1 dòng) ───────────────────────────────────────────────────────

export async function getSettings(): Promise<UsageSettings> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT daily_budget_usd, usd_to_vnd, updated_at FROM ai_usage_settings WHERE id = 1"
  );
  return {
    daily_budget_usd: numOrNull(row?.daily_budget_usd),
    usd_to_vnd: numOrNull(row?.usd_to_vnd),
    updated_at: isoOrNull(row?.updated_at),
  };
}

export async function saveSettings(input: {
  dailyBudgetUsd: number | null;
  usdToVnd: number | null;
  updatedBy: number;
}): Promise<void> {
  await runSql(
    `INSERT INTO ai_usage_settings (id, daily_budget_usd, usd_to_vnd, updated_by, updated_at)
     VALUES (1, ?, ?, ?, NOW())
     ON CONFLICT (id) DO UPDATE SET
       daily_budget_usd = EXCLUDED.daily_budget_usd,
       usd_to_vnd = EXCLUDED.usd_to_vnd,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [input.dailyBudgetUsd, input.usdToVnd, input.updatedBy]
  );
}
