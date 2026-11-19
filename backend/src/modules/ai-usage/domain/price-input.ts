// Kiểm tra body giá model do Admin nhập (USD / 1 triệu token; STT: USD / phút).
import { HttpError } from "../../../shared/errors/http-error";
import { isBlank, requireNumber } from "../../../shared/validation/validate";
import type { PriceValues } from "./usage.types";

const MAX_PRICE = 10_000;

function price(value: unknown, field: string): number | null {
  if (isBlank(value)) return null;
  return requireNumber(value, field, { min: 0, max: MAX_PRICE });
}

export function parsePriceValues(body: Record<string, unknown>): PriceValues {
  const values: PriceValues = {
    inputUsdPerMtok: price(body.input_usd_per_mtok, "input_usd_per_mtok"),
    cachedInputUsdPerMtok: price(body.cached_input_usd_per_mtok, "cached_input_usd_per_mtok"),
    cacheWriteUsdPerMtok: price(body.cache_write_usd_per_mtok, "cache_write_usd_per_mtok"),
    outputUsdPerMtok: price(body.output_usd_per_mtok, "output_usd_per_mtok"),
    audioUsdPerMinute: price(body.audio_usd_per_minute, "audio_usd_per_minute"),
  };
  const hasTokenPrice = values.inputUsdPerMtok !== null && values.outputUsdPerMtok !== null;
  if (!hasTokenPrice && values.audioUsdPerMinute === null) {
    throw new HttpError(400, "MISSING_FIELDS", "input and output prices (or an audio price per minute) are required");
  }
  return values;
}
