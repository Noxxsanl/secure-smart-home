// POST /api/dashboard/ai-usage/prices      — thêm giá model (chỉ ADMIN)
// PUT  /api/dashboard/ai-usage/prices/:id  — sửa giá (chỉ ADMIN)
// Body: input_usd_per_mtok, cached_input_usd_per_mtok, cache_write_usd_per_mtok, output_usd_per_mtok,
//       audio_usd_per_minute (null/bỏ trống = không áp dụng), source_url? (trang giá đã tra); POST thêm provider, model.
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import { requestMeta } from "../../../../core/http/request-meta";
import { optionalString, parseIdParam, requireString } from "../../../../shared/validation/validate";
import { parsePriceValues } from "../../domain/price-input";
import { createModelPrice, updateModelPrice } from "./save-model-price.handler";

const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,31}$/;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,127}$/;
const URL_PATTERN = /^https:\/\/[^\s]+$/;

function sourceUrl(body: Record<string, unknown>): string | null {
  return optionalString(body.source_url, "source_url", { max: 255, pattern: URL_PATTERN }) ?? null;
}

export async function createModelPriceController(req: Request, res: Response): Promise<void> {
  requireAdmin(getAuth(req));
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = await createModelPrice(
    getAuth(req),
    {
      provider: requireString(body.provider, "provider", { max: 32, pattern: PROVIDER_PATTERN }).toLowerCase(),
      model: requireString(body.model, "model", { max: 128, pattern: MODEL_PATTERN }),
      values: parsePriceValues(body),
      sourceUrl: sourceUrl(body),
    },
    requestMeta(req)
  );
  res.status(201).json(result);
}

export async function updateModelPriceController(req: Request, res: Response): Promise<void> {
  requireAdmin(getAuth(req));
  const body = (req.body ?? {}) as Record<string, unknown>;
  res.json(
    await updateModelPrice(
      getAuth(req),
      parseIdParam(req.params.id),
      { values: parsePriceValues(body), sourceUrl: sourceUrl(body) },
      requestMeta(req)
    )
  );
}
