// Truy vấn thống kê trên ai_usage_logs (bảng của module). Ngày/giờ gom theo múi giờ Việt Nam để khớp "hôm nay"
// của người vận hành. pg trả BIGINT/NUMERIC dạng chuỗi → đổi sang number ở đây.
import { queryOne, queryRows } from "../../../infrastructure/database/db";
import { modelMatchSql } from "./model-match";

/** Múi giờ gom nhóm theo ngày/giờ (hằng số — không lấy từ input). */
const TZ = "Asia/Ho_Chi_Minh";

const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export interface UsageTotals {
  calls: number;
  errors: number;
  requests: number;
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  audio_seconds: number;
  cost_usd: number;
  unpriced_calls: number;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  avg_ttft_ms: number | null;
}

export async function getTotals(from: Date): Promise<UsageTotals> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT COUNT(*) AS calls,
            COUNT(*) FILTER (WHERE status <> 'success') AS errors,
            COUNT(DISTINCT COALESCE(request_id, 'row-' || id::text)) AS requests,
            SUM(input_tokens) AS input_tokens,
            SUM(cached_input_tokens) AS cached_input_tokens,
            SUM(cache_write_tokens) AS cache_write_tokens,
            SUM(output_tokens) AS output_tokens,
            SUM(reasoning_tokens) AS reasoning_tokens,
            SUM(audio_seconds) AS audio_seconds,
            SUM(cost_usd) AS cost_usd,
            COUNT(*) FILTER (WHERE cost_usd IS NULL) AS unpriced_calls,
            AVG(latency_ms) AS avg_latency_ms,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency_ms,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
            AVG(ttft_ms) AS avg_ttft_ms
       FROM ai_usage_logs
      WHERE occurred_at >= ?`,
    [from]
  );
  return {
    calls: num(row?.calls),
    errors: num(row?.errors),
    requests: num(row?.requests),
    input_tokens: num(row?.input_tokens),
    cached_input_tokens: num(row?.cached_input_tokens),
    cache_write_tokens: num(row?.cache_write_tokens),
    output_tokens: num(row?.output_tokens),
    reasoning_tokens: num(row?.reasoning_tokens),
    audio_seconds: num(row?.audio_seconds),
    cost_usd: num(row?.cost_usd),
    unpriced_calls: num(row?.unpriced_calls),
    avg_latency_ms: numOrNull(row?.avg_latency_ms),
    p50_latency_ms: numOrNull(row?.p50_latency_ms),
    p95_latency_ms: numOrNull(row?.p95_latency_ms),
    avg_ttft_ms: numOrNull(row?.avg_ttft_ms),
  };
}

/** Chi phí + số lượt từ 00:00 hôm nay (giờ Việt Nam) — so với ngân sách ngày. */
export async function getToday(): Promise<{ calls: number; cost_usd: number }> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT COUNT(*) AS calls, SUM(cost_usd) AS cost_usd
       FROM ai_usage_logs
      WHERE occurred_at >= (date_trunc('day', NOW() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`
  );
  return { calls: num(row?.calls), cost_usd: num(row?.cost_usd) };
}

export interface UsageBucket {
  /** Giờ địa phương: "YYYY-MM-DD" (theo ngày) hoặc "YYYY-MM-DDTHH:00" (theo giờ). */
  bucket: string;
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  p95_latency_ms: number | null;
}

/** Chuỗi thời gian liên tục (bucket trống = 0) từ `from` tới hiện tại. */
export async function getSeries(from: Date, unit: "hour" | "day"): Promise<UsageBucket[]> {
  const format = unit === "hour" ? `'YYYY-MM-DD"T"HH24:00'` : `'YYYY-MM-DD'`;
  const step = unit === "hour" ? "1 hour" : "1 day";
  const rows = await queryRows<Record<string, unknown>>(
    `WITH buckets AS (
       SELECT generate_series(
         date_trunc('${unit}', ?::timestamptz AT TIME ZONE '${TZ}'),
         date_trunc('${unit}', NOW() AT TIME ZONE '${TZ}'),
         INTERVAL '${step}'
       ) AS b
     ),
     agg AS (
       SELECT date_trunc('${unit}', occurred_at AT TIME ZONE '${TZ}') AS b,
              COUNT(*) AS calls,
              COUNT(*) FILTER (WHERE status <> 'success') AS errors,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens,
              SUM(cost_usd) AS cost_usd,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms
         FROM ai_usage_logs
        WHERE occurred_at >= ?
        GROUP BY 1
     )
     SELECT to_char(buckets.b, ${format}) AS bucket, agg.calls, agg.errors, agg.input_tokens, agg.output_tokens,
            agg.cost_usd, agg.p95_latency_ms
       FROM buckets LEFT JOIN agg ON agg.b = buckets.b
      ORDER BY buckets.b`,
    [from, from]
  );
  return rows.map((row) => ({
    bucket: String(row.bucket),
    calls: num(row.calls),
    errors: num(row.errors),
    input_tokens: num(row.input_tokens),
    output_tokens: num(row.output_tokens),
    cost_usd: num(row.cost_usd),
    p95_latency_ms: numOrNull(row.p95_latency_ms),
  }));
}

export interface ModelBreakdown {
  provider: string;
  model: string;
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  unpriced_calls: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
}

export async function getByModel(from: Date): Promise<ModelBreakdown[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT provider, model, COUNT(*) AS calls,
            COUNT(*) FILTER (WHERE status <> 'success') AS errors,
            SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
            SUM(cost_usd) AS cost_usd, COUNT(*) FILTER (WHERE cost_usd IS NULL) AS unpriced_calls,
            AVG(latency_ms) AS avg_latency_ms,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms
       FROM ai_usage_logs
      WHERE occurred_at >= ?
      GROUP BY provider, model
      ORDER BY SUM(cost_usd) DESC NULLS LAST, COUNT(*) DESC
      LIMIT 50`,
    [from]
  );
  return rows.map((row) => ({
    provider: String(row.provider),
    model: String(row.model),
    calls: num(row.calls),
    errors: num(row.errors),
    input_tokens: num(row.input_tokens),
    output_tokens: num(row.output_tokens),
    cost_usd: num(row.cost_usd),
    unpriced_calls: num(row.unpriced_calls),
    avg_latency_ms: numOrNull(row.avg_latency_ms),
    p95_latency_ms: numOrNull(row.p95_latency_ms),
  }));
}

export interface PurposeBreakdown {
  purpose: string;
  calls: number;
  errors: number;
  total_tokens: number;
  cost_usd: number;
  avg_latency_ms: number | null;
}

export async function getByPurpose(from: Date): Promise<PurposeBreakdown[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT purpose, COUNT(*) AS calls,
            COUNT(*) FILTER (WHERE status <> 'success') AS errors,
            SUM(input_tokens + output_tokens) AS total_tokens,
            SUM(cost_usd) AS cost_usd, AVG(latency_ms) AS avg_latency_ms
       FROM ai_usage_logs
      WHERE occurred_at >= ?
      GROUP BY purpose
      ORDER BY SUM(cost_usd) DESC NULLS LAST, COUNT(*) DESC`,
    [from]
  );
  return rows.map((row) => ({
    purpose: String(row.purpose),
    calls: num(row.calls),
    errors: num(row.errors),
    total_tokens: num(row.total_tokens),
    cost_usd: num(row.cost_usd),
    avg_latency_ms: numOrNull(row.avg_latency_ms),
  }));
}

export interface UnpricedModel {
  provider: string;
  model: string;
  calls: number;
  /** Đã có dòng giá khớp nhưng thiếu trường cần thiết (VD chỉ có giá âm thanh) → sửa dòng đó; null = chưa có giá. */
  price_id: number | null;
}

/** Model có lượt gọi trong 30 ngày chưa tính được chi phí (chưa có giá, hoặc giá thiếu trường) — nhắc Admin. */
export async function listUnpricedModels(): Promise<UnpricedModel[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT l.provider, l.model, COUNT(*) AS calls,
            (SELECT p.id FROM ai_model_prices p
              WHERE p.provider = l.provider AND ${modelMatchSql("p.model", "l.model")}
              ORDER BY LENGTH(p.model) DESC LIMIT 1) AS price_id
       FROM ai_usage_logs l
      WHERE l.occurred_at >= NOW() - INTERVAL '30 days' AND l.cost_usd IS NULL
      GROUP BY l.provider, l.model
      ORDER BY COUNT(*) DESC
      LIMIT 20`
  );
  return rows.map((row) => ({
    provider: String(row.provider),
    model: String(row.model),
    calls: num(row.calls),
    price_id: numOrNull(row.price_id),
  }));
}
