// GET /api/dashboard/ai-usage/summary?range=24h|7d|30d (Admin + Operator).
import type { Request, Response } from "express";
import { optionalEnum, queryString } from "../../../../shared/validation/validate";
import { USAGE_RANGES } from "../../domain/usage-summary";
import { getUsageSummary } from "./get-usage-summary.handler";

export async function getUsageSummaryController(req: Request, res: Response): Promise<void> {
  const range = optionalEnum(queryString(req.query.range), "range", USAGE_RANGES) ?? "7d";
  res.json(await getUsageSummary(range));
}
