// Kiểu dữ liệu của module ai-usage: số liệu mỗi lần gọi LLM/STT của AI Agent, giá theo model, ngân sách/tỷ giá.
// KHÔNG có trường nào chứa nội dung prompt/câu trả lời (đề xuất AI Agent §8.3; bất biến 2).

/** Mục đích của lượt gọi — khớp agent/src/smarthome_agent/usage (PURPOSES). */
export const USAGE_PURPOSES = ["planner", "clarify", "summary", "stt", "eval", "other"] as const;
export type UsagePurpose = (typeof USAGE_PURPOSES)[number];

export const USAGE_STATUSES = ["success", "error", "timeout"] as const;
export type UsageStatus = (typeof USAGE_STATUSES)[number];

/** Nơi ghi: agent (dịch vụ agent/), backend (Agent chạy trong backend sau này), eval (bộ đánh giá). */
export const USAGE_SOURCES = ["agent", "backend", "eval"] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

export const PRICE_SOURCES = ["official", "litellm", "manual"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

/**
 * Một lần gọi LLM/STT. Token chuẩn hoá giữa các nhà cung cấp:
 *   inputTokens       = TỔNG token vào (OpenAI prompt_tokens; Anthropic input + cache_read + cache_creation)
 *   cachedInputTokens = phần đọc từ cache; cacheWriteTokens = phần ghi cache (Anthropic) — đều nằm trong inputTokens
 *   reasoningTokens   = token suy luận, ĐÃ nằm trong outputTokens (chỉ để hiển thị)
 */
export interface UsageRecordInput {
  provider: string;
  model: string;
  purpose: UsagePurpose;
  source: UsageSource;
  status: UsageStatus;
  errorCode: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  audioSeconds: number | null;
  latencyMs: number;
  ttftMs: number | null;
  homeId: number | null;
  userId: number | null;
  requestId: string | null;
  roundIndex: number | null;
  occurredAt: Date;
}

export interface ModelPrice {
  id: number;
  provider: string;
  model: string;
  input_usd_per_mtok: number | null;
  cached_input_usd_per_mtok: number | null;
  cache_write_usd_per_mtok: number | null;
  output_usd_per_mtok: number | null;
  audio_usd_per_minute: number | null;
  source: PriceSource;
  source_url: string | null;
  checked_at: string | null;
  updated_at: string;
  /** Số lượt gọi trong 30 ngày qua dùng model này (để biết giá nào đang được dùng). */
  calls_30d: number;
}

/** Giá nhập/sửa: USD / 1 triệu token; audio: USD / phút. null = không áp dụng. */
export interface PriceValues {
  inputUsdPerMtok: number | null;
  cachedInputUsdPerMtok: number | null;
  cacheWriteUsdPerMtok: number | null;
  outputUsdPerMtok: number | null;
  audioUsdPerMinute: number | null;
}

export interface UsageSettings {
  daily_budget_usd: number | null;
  usd_to_vnd: number | null;
  updated_at: string | null;
}
