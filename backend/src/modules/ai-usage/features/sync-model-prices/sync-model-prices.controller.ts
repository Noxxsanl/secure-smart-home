// POST /api/dashboard/ai-usage/prices/sync (chỉ ADMIN) — giá từ kho giá công khai (AI_PRICING_SOURCE_URL).
// Body { apply?: boolean }: mặc định XEM TRƯỚC (không ghi gì); apply = true mới ghi.
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import { requestMeta } from "../../../../core/http/request-meta";
import { syncModelPrices } from "./sync-model-prices.handler";

export async function syncModelPricesController(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  requireAdmin(auth);
  const apply = (req.body as Record<string, unknown> | undefined)?.apply === true;
  res.json(await syncModelPrices(auth, apply, requestMeta(req)));
}
