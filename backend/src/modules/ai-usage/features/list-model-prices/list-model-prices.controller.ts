// GET /api/dashboard/ai-usage/prices (Admin + Operator xem; sửa chỉ Admin).
import type { Request, Response } from "express";
import { env } from "../../../../config/env";
import { listPrices } from "../../infrastructure/prices.repository";
import { listUnpricedModels } from "../../infrastructure/usage-stats.repository";

export async function listModelPricesController(_req: Request, res: Response): Promise<void> {
  const [prices, unpriced] = await Promise.all([listPrices(), listUnpricedModels()]);
  res.json({ prices, unpriced_models: unpriced, sync_source_url: env.aiPricingSourceUrl });
}
