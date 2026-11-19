// Truy vấn chỉ-đọc JOIN smart_homes (module homes) để hiện tên nhà cạnh số liệu dùng AI (quy tắc T2).
import { queryRows, type SqlParam } from "../../../infrastructure/database/db";

const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));

export interface HomeUsage {
  home_id: number;
  home_name: string | null;
  calls: number;
  total_tokens: number;
  cost_usd: number;
}

/** Nhà dùng AI nhiều nhất (theo chi phí, rồi số lượt). Nhà đã xoá: home_name null. */
export async function listTopHomes(from: Date, limit: number): Promise<HomeUsage[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT l.home_id, h.name AS home_name, COUNT(*) AS calls,
            SUM(l.input_tokens + l.output_tokens) AS total_tokens, SUM(l.cost_usd) AS cost_usd
       FROM ai_usage_logs l
       LEFT JOIN smart_homes h ON h.id = l.home_id
      WHERE l.occurred_at >= ? AND l.home_id IS NOT NULL
      GROUP BY l.home_id, h.name
      ORDER BY SUM(l.cost_usd) DESC NULLS LAST, COUNT(*) DESC
      LIMIT ${Math.max(1, Math.min(50, Math.trunc(limit)))}`,
    [from]
  );
  return rows.map((row) => ({
    home_id: num(row.home_id),
    home_name: row.home_name === null || row.home_name === undefined ? null : String(row.home_name),
    calls: num(row.calls),
    total_tokens: num(row.total_tokens),
    cost_usd: num(row.cost_usd),
  }));
}

export interface UsageCall {
  id: number;
  occurred_at: string;
  provider: string;
  model: string;
  purpose: string;
  source: string;
  status: string;
  error_code: string | null;
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  audio_seconds: number | null;
  latency_ms: number;
  ttft_ms: number | null;
  cost_usd: number | null;
  home_id: number | null;
  home_name: string | null;
  request_id: string | null;
  round_index: number | null;
}

export interface CallFilter {
  status?: string;
  model?: string;
  purpose?: string;
}

/** Lượt gọi mới nhất. Không có nội dung prompt/câu trả lời — bảng không lưu. */
export async function listRecentCalls(filter: CallFilter, limit: number): Promise<UsageCall[]> {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (filter.status === "failed") where.push("l.status <> 'success'");
  else if (filter.status) {
    where.push("l.status = ?");
    params.push(filter.status);
  }
  if (filter.model) {
    where.push("l.model = ?");
    params.push(filter.model);
  }
  if (filter.purpose) {
    where.push("l.purpose = ?");
    params.push(filter.purpose);
  }
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT l.id, l.occurred_at, l.provider, l.model, l.purpose, l.source, l.status, l.error_code,
            l.input_tokens, l.cached_input_tokens, l.cache_write_tokens, l.output_tokens, l.reasoning_tokens,
            l.audio_seconds, l.latency_ms, l.ttft_ms, l.cost_usd, l.home_id, h.name AS home_name,
            l.request_id, l.round_index
       FROM ai_usage_logs l
       LEFT JOIN smart_homes h ON h.id = l.home_id
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY l.occurred_at DESC, l.id DESC
      LIMIT ${Math.max(1, Math.min(200, Math.trunc(limit)))}`,
    params
  );
  return rows.map((row) => ({
    id: num(row.id),
    occurred_at: iso(row.occurred_at),
    provider: String(row.provider),
    model: String(row.model),
    purpose: String(row.purpose),
    source: String(row.source),
    status: String(row.status),
    error_code: row.error_code === null ? null : String(row.error_code),
    input_tokens: num(row.input_tokens),
    cached_input_tokens: num(row.cached_input_tokens),
    cache_write_tokens: num(row.cache_write_tokens),
    output_tokens: num(row.output_tokens),
    reasoning_tokens: num(row.reasoning_tokens),
    audio_seconds: numOrNull(row.audio_seconds),
    latency_ms: num(row.latency_ms),
    ttft_ms: numOrNull(row.ttft_ms),
    cost_usd: numOrNull(row.cost_usd),
    home_id: numOrNull(row.home_id),
    home_name: row.home_name === null || row.home_name === undefined ? null : String(row.home_name),
    request_id: row.request_id === null ? null : String(row.request_id),
    round_index: numOrNull(row.round_index),
  }));
}
