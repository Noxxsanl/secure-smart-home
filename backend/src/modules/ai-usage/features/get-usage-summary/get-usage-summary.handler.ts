// Tổng hợp số liệu dùng AI trong khoảng thời gian: tổng, chuỗi theo giờ/ngày, theo model, theo mục đích, theo nhà.
import { rangeStart, type UsageRange, type UsageSummary } from "../../domain/usage-summary";
import { getSettings } from "../../infrastructure/prices.repository";
import {
  getByModel,
  getByPurpose,
  getSeries,
  getToday,
  getTotals,
  listUnpricedModels,
} from "../../infrastructure/usage-stats.repository";
import { listTopHomes } from "../../infrastructure/usage.read-model";

export async function getUsageSummary(range: UsageRange): Promise<UsageSummary> {
  const now = Date.now();
  const { from, unit } = rangeStart(range, now);
  const [totals, today, settings, series, byModel, byPurpose, topHomes, unpriced] = await Promise.all([
    getTotals(from),
    getToday(),
    getSettings(),
    getSeries(from, unit),
    getByModel(from),
    getByPurpose(from),
    listTopHomes(from, 5),
    listUnpricedModels(),
  ]);
  return {
    range,
    from: from.toISOString(),
    to: new Date(now).toISOString(),
    totals: {
      ...totals,
      total_tokens: totals.input_tokens + totals.output_tokens,
      error_rate: totals.calls > 0 ? totals.errors / totals.calls : 0,
      cost_per_request_usd: totals.requests > 0 ? totals.cost_usd / totals.requests : null,
    },
    today,
    settings,
    series,
    by_model: byModel,
    by_purpose: byPurpose,
    top_homes: topHomes,
    unpriced_models: unpriced,
  };
}
