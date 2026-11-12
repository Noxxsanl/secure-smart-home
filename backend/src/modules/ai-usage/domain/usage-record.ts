// Kiểm tra một bản ghi usage từ dịch vụ agent (kênh /api/service) hoặc từ code backend (facade). Ném HttpError 400
// với `detail` tiếng Anh, không chứa giá trị đã gửi.
import { HttpError } from "../../../shared/errors/http-error";
import {
  isBlank,
  optionalEnum,
  optionalId,
  optionalInt,
  optionalIsoDate,
  optionalNumber,
  optionalString,
  requireEnum,
  requireInt,
  requireString,
} from "../../../shared/validation/validate";
import { USAGE_PURPOSES, USAGE_SOURCES, USAGE_STATUSES, type UsageRecordInput } from "./usage.types";

const MAX_TOKENS = 50_000_000;
const MAX_LATENCY_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,31}$/;
// Tên model: OpenAI/Anthropic (gpt-5-mini, claude-opus-5-5), Ollama (qwen2.5:7b), có thể kèm tiền tố "org/"
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,127}$/;
const CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

export function parseUsageRecord(value: unknown, field = "record"): UsageRecordInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_INPUT", `${field} must be an object`);
  }
  const body = value as Record<string, unknown>;
  const tokens = (key: string) => optionalInt(body[key], `${field}.${key}`, { min: 0, max: MAX_TOKENS }) ?? 0;

  const record: UsageRecordInput = {
    provider: requireString(body.provider, `${field}.provider`, { max: 32, pattern: PROVIDER_PATTERN }).toLowerCase(),
    model: requireString(body.model, `${field}.model`, { max: 128, pattern: MODEL_PATTERN }),
    purpose: requireEnum(body.purpose, `${field}.purpose`, USAGE_PURPOSES),
    source: optionalEnum(body.source, `${field}.source`, USAGE_SOURCES) ?? "agent",
    status: requireEnum(body.status, `${field}.status`, USAGE_STATUSES),
    errorCode: optionalString(body.error_code, `${field}.error_code`, { max: 64, pattern: CODE_PATTERN }) ?? null,
    inputTokens: tokens("input_tokens"),
    cachedInputTokens: tokens("cached_input_tokens"),
    cacheWriteTokens: tokens("cache_write_tokens"),
    outputTokens: tokens("output_tokens"),
    reasoningTokens: tokens("reasoning_tokens"),
    audioSeconds: optionalNumber(body.audio_seconds, `${field}.audio_seconds`, { min: 0, max: 36_000 }) ?? null,
    latencyMs: requireInt(body.latency_ms, `${field}.latency_ms`, { min: 0, max: MAX_LATENCY_MS }),
    ttftMs: optionalInt(body.ttft_ms, `${field}.ttft_ms`, { min: 0, max: MAX_LATENCY_MS }) ?? null,
    homeId: optionalId(body.home_id, `${field}.home_id`) ?? null,
    userId: optionalId(body.user_id, `${field}.user_id`) ?? null,
    requestId: optionalString(body.request_id, `${field}.request_id`, { max: 64, pattern: CODE_PATTERN }) ?? null,
    roundIndex: optionalInt(body.round_index, `${field}.round_index`, { min: 0, max: 100 }) ?? null,
    occurredAt: optionalIsoDate(body.occurred_at, `${field}.occurred_at`) ?? new Date(),
  };

  if (record.cachedInputTokens + record.cacheWriteTokens > record.inputTokens) {
    throw new HttpError(400, "INVALID_INPUT", `${field}: cached + cache_write tokens must not exceed input_tokens`);
  }
  if (record.reasoningTokens > record.outputTokens) {
    throw new HttpError(400, "INVALID_INPUT", `${field}: reasoning_tokens is part of output_tokens`);
  }
  const now = Date.now();
  if (record.occurredAt.getTime() > now + MAX_CLOCK_SKEW_MS || record.occurredAt.getTime() < now - MAX_AGE_MS) {
    throw new HttpError(400, "INVALID_INPUT", `${field}.occurred_at must be within the last 7 days`);
  }
  if (record.status === "success" && !isBlank(body.error_code)) record.errorCode = null;
  return record;
}
