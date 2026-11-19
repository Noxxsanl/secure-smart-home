// Khoảng thời gian của tab AI Usage và hình dạng response tổng hợp.
import type {
  ModelBreakdown,
  PurposeBreakdown,
  UsageBucket,
  UsageTotals,
} from "../infrastructure/usage-stats.repository";
import type { HomeUsage } from "../infrastructure/usage.read-model";
import type { UsageSettings } from "./usage.types";

export const USAGE_RANGES = ["24h", "7d", "30d"] as const;
export type UsageRange = (typeof USAGE_RANGES)[number];

const HOUR_MS = 3600 * 1000;

export function rangeStart(range: UsageRange, now = Date.now()): { from: Date; unit: "hour" | "day" } {
  if (range === "24h") return { from: new Date(now - 24 * HOUR_MS), unit: "hour" };
  return { from: new Date(now - (range === "7d" ? 7 : 30) * 24 * HOUR_MS), unit: "day" };
}

export interface UsageSummary {
  range: UsageRange;
  from: string;
  to: string;
  totals: UsageTotals & { total_tokens: number; error_rate: number; cost_per_request_usd: number | null };
  today: { calls: number; cost_usd: number };
  settings: UsageSettings;
  series: UsageBucket[];
  by_model: ModelBreakdown[];
  by_purpose: PurposeBreakdown[];
  top_homes: HomeUsage[];
  unpriced_models: { provider: string; model: string; calls: number }[];
}
