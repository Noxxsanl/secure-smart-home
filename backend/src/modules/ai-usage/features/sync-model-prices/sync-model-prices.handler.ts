// Đồng bộ giá từ kho giá LLM công khai (mặc định LiteLLM model_prices_and_context_window.json, cấu hình bằng
// AI_PRICING_SOURCE_URL — chỉ từ env, không nhận URL từ request nên không có SSRF).
//   - Giá do Admin nhập tay (source "manual") được giữ nguyên.
//   - Giá khác: lấy từng trường từ nguồn; trường nguồn không có thì giữ giá cũ. Có thay đổi → source "litellm".
//   - Model đã được gọi (30 ngày) mà chưa có giá: thêm nếu nguồn có.
// Mặc định chỉ XEM TRƯỚC (apply = false, không ghi gì); Admin xem danh sách rồi mới áp dụng. Khi áp dụng: mọi thay
// đổi + tính bù chi phí trong MỘT transaction, audit ghi giá trước/sau. Đọc nguồn có giới hạn kích thước theo luồng
// và không theo redirect.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { env } from "../../../../config/env";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { lookupLiteLlmPrice, samePrices } from "../../domain/pricing-source";
import type { ModelPrice, PriceValues } from "../../domain/usage.types";
import { insertPrice, listPrices, updatePrice } from "../../infrastructure/prices.repository";
import { listUnpricedModels } from "../../infrastructure/usage-stats.repository";
import { backfillMissingCosts } from "../../infrastructure/usage.repository";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export interface PriceSyncChange {
  provider: string;
  model: string;
  action: "updated" | "added";
  before: PriceValues | null;
  after: PriceValues;
}

export interface PriceSyncResult {
  source_url: string;
  /** false = bản xem trước, chưa ghi. */
  applied: boolean;
  changes: PriceSyncChange[];
  unchanged: string[];
  not_found: string[];
  skipped_manual: string[];
}

const tooLarge = () => new HttpError(502, "PRICE_SOURCE_INVALID", "Pricing source is too large");

async function fetchCatalog(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
      redirect: "error",
    });
  } catch {
    throw new HttpError(502, "PRICE_SOURCE_UNREACHABLE", "Pricing source is unreachable");
  }
  if (!response.ok) throw new HttpError(502, "PRICE_SOURCE_UNREACHABLE", `Pricing source returned HTTP ${response.status}`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_SOURCE_BYTES) throw tooLarge();
  if (!response.body) throw new HttpError(502, "PRICE_SOURCE_INVALID", "Pricing source returned no body");
  // Đọc theo luồng, dừng ngay khi vượt giới hạn (không tin Content-Length)
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(502, "PRICE_SOURCE_INVALID", "Pricing source is not valid JSON");
  }
}

function valuesOf(price: ModelPrice): PriceValues {
  return {
    inputUsdPerMtok: price.input_usd_per_mtok,
    cachedInputUsdPerMtok: price.cached_input_usd_per_mtok,
    cacheWriteUsdPerMtok: price.cache_write_usd_per_mtok,
    outputUsdPerMtok: price.output_usd_per_mtok,
    audioUsdPerMinute: price.audio_usd_per_minute,
  };
}

/** Trường nào nguồn có thì lấy, không có thì giữ giá cũ. */
function merge(current: PriceValues, source: PriceValues): PriceValues {
  return {
    inputUsdPerMtok: source.inputUsdPerMtok ?? current.inputUsdPerMtok,
    cachedInputUsdPerMtok: source.cachedInputUsdPerMtok ?? current.cachedInputUsdPerMtok,
    cacheWriteUsdPerMtok: source.cacheWriteUsdPerMtok ?? current.cacheWriteUsdPerMtok,
    outputUsdPerMtok: source.outputUsdPerMtok ?? current.outputUsdPerMtok,
    audioUsdPerMinute: source.audioUsdPerMinute ?? current.audioUsdPerMinute,
  };
}

export async function syncModelPrices(auth: AuthContext, apply: boolean, meta: RequestMeta): Promise<PriceSyncResult> {
  requireAdmin(auth);
  const sourceUrl = env.aiPricingSourceUrl;
  const catalog = await fetchCatalog(sourceUrl);
  const [prices, unpriced] = await Promise.all([listPrices(), listUnpricedModels()]);
  const result: PriceSyncResult = {
    source_url: sourceUrl,
    applied: apply,
    changes: [],
    unchanged: [],
    not_found: [],
    skipped_manual: [],
  };
  const now = new Date();

  // Xem trước và áp dụng đi cùng một đường code; xem trước thì không ghi (writes = false)
  await withTransaction(async (conn) => {
    for (const price of prices) {
      const label = `${price.provider}/${price.model}`;
      if (price.source === "manual") {
        result.skipped_manual.push(label);
        continue;
      }
      const found = lookupLiteLlmPrice(catalog, price.provider, price.model);
      if (!found) {
        result.not_found.push(label);
        continue;
      }
      const before = valuesOf(price);
      const after = merge(before, found);
      if (samePrices(before, after)) {
        result.unchanged.push(label);
        continue;
      }
      if (apply) {
        await updatePrice(conn, price.id, { values: after, source: "litellm", sourceUrl, checkedAt: now, updatedBy: auth.userId });
        await backfillMissingCosts(conn, price.provider, price.model);
      }
      result.changes.push({ provider: price.provider, model: price.model, action: "updated", before, after });
    }
    for (const model of unpriced) {
      // Đã có dòng giá khớp (thiếu trường) → thuộc vòng cập nhật ở trên, không thêm dòng mới
      if (model.price_id !== null) continue;
      const found = lookupLiteLlmPrice(catalog, model.provider, model.model);
      if (!found) {
        result.not_found.push(`${model.provider}/${model.model}`);
        continue;
      }
      if (apply) {
        // Admin vừa thêm tay cùng model trong lúc đồng bộ → bỏ qua, không làm hỏng cả lượt
        const added = await insertPrice(
          conn,
          model.provider,
          model.model,
          { values: found, source: "litellm", sourceUrl, checkedAt: now, updatedBy: auth.userId },
          true
        );
        if (added === null) continue;
        await backfillMissingCosts(conn, model.provider, model.model);
      }
      result.changes.push({ provider: model.provider, model: model.model, action: "added", before: null, after: found });
    }
  });

  if (!apply) return result;
  await logEvent({
    eventType: "AI_PRICES_SYNCED",
    actorUserId: auth.userId,
    message: `${auth.username} đồng bộ giá LLM: ${result.changes.length} thay đổi, ${result.not_found.length} model không có trong nguồn`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: {
      source_url: sourceUrl,
      changes: result.changes.map((change) => ({
        model: `${change.provider}/${change.model}`,
        before: change.before,
        after: change.after,
      })),
    },
  });
  return result;
}
