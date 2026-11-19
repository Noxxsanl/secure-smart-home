// Đọc kho giá LLM công khai của LiteLLM (model_prices_and_context_window.json — được cộng đồng duy trì theo trang giá
// của từng nhà cung cấp, có trường `source` cho từng model). Cấu trúc: object khoá = tên model, giá trị có
// `litellm_provider`, `input_cost_per_token`, `output_cost_per_token`, `cache_read_input_token_cost`,
// `cache_creation_input_token_cost`, `input_cost_per_second` (STT)… đơn vị USD / token (giây).
import type { PriceValues } from "./usage.types";

/** provider của dự án → các giá trị `litellm_provider` tương ứng (API trực tiếp, không qua Bedrock/Vertex/Azure). */
const PROVIDER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  openai: ["openai", "text-completion-openai"],
  anthropic: ["anthropic"],
  google: ["gemini"],
  mistral: ["mistral"],
  deepseek: ["deepseek"],
};

// Giá vô lý (> 10.000 USD / triệu token hoặc / phút) coi như dữ liệu hỏng; giá 0 (OpenAI/Anthropic không có model
// miễn phí) cũng coi như không có — trường đó giữ giá cũ thay vì làm chi phí về 0.
const MAX_PRICE = 10_000;

function perMillion(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const price = value * 1_000_000;
  return price <= MAX_PRICE ? Math.round(price * 1e6) / 1e6 : null;
}

function perMinute(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const price = value * 60;
  return price <= MAX_PRICE ? Math.round(price * 1e6) / 1e6 : null;
}

function entryFor(catalog: Record<string, unknown>, provider: string, model: string): Record<string, unknown> | null {
  const aliases = PROVIDER_ALIASES[provider] ?? [provider];
  for (const key of [model, `${provider}/${model}`]) {
    const entry = catalog[key];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.litellm_provider === "string" && aliases.includes(record.litellm_provider)) return record;
  }
  return null;
}

/** Giá của (provider, model) trong kho LiteLLM, hoặc null nếu không có / không đọc được. */
export function lookupLiteLlmPrice(catalog: unknown, provider: string, model: string): PriceValues | null {
  if (typeof catalog !== "object" || catalog === null || Array.isArray(catalog)) return null;
  const entry = entryFor(catalog as Record<string, unknown>, provider, model);
  if (!entry) return null;
  const values: PriceValues = {
    inputUsdPerMtok: perMillion(entry.input_cost_per_token),
    cachedInputUsdPerMtok: perMillion(entry.cache_read_input_token_cost),
    cacheWriteUsdPerMtok: perMillion(entry.cache_creation_input_token_cost),
    outputUsdPerMtok: perMillion(entry.output_cost_per_token),
    audioUsdPerMinute: perMinute(entry.input_cost_per_second),
  };
  const hasTokenPrice = values.inputUsdPerMtok !== null && values.outputUsdPerMtok !== null;
  return hasTokenPrice || values.audioUsdPerMinute !== null ? values : null;
}

export function samePrices(a: PriceValues, b: PriceValues): boolean {
  return (
    a.inputUsdPerMtok === b.inputUsdPerMtok &&
    a.cachedInputUsdPerMtok === b.cachedInputUsdPerMtok &&
    a.cacheWriteUsdPerMtok === b.cacheWriteUsdPerMtok &&
    a.outputUsdPerMtok === b.outputUsdPerMtok &&
    a.audioUsdPerMinute === b.audioUsdPerMinute
  );
}
