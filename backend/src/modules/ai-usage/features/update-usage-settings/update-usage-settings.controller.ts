// PUT /api/dashboard/ai-usage/settings (chỉ ADMIN): { daily_budget_usd: number|null, usd_to_vnd: number|null }.
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import { requestMeta } from "../../../../core/http/request-meta";
import { isBlank, requireNumber } from "../../../../shared/validation/validate";
import { logEvent } from "../../../audit";
import { getSettings, saveSettings } from "../../infrastructure/prices.repository";

function nullableAmount(value: unknown, field: string, max: number): number | null {
  return isBlank(value) ? null : requireNumber(value, field, { min: 0, max });
}

export async function updateUsageSettingsController(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  requireAdmin(auth);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const dailyBudgetUsd = nullableAmount(body.daily_budget_usd, "daily_budget_usd", 1_000_000);
  const usdToVnd = nullableAmount(body.usd_to_vnd, "usd_to_vnd", 1_000_000);
  await saveSettings({ dailyBudgetUsd, usdToVnd, updatedBy: auth.userId });
  const meta = requestMeta(req);
  await logEvent({
    eventType: "AI_SETTINGS_UPDATED",
    actorUserId: auth.userId,
    message: `${auth.username} đặt ngân sách AI ${dailyBudgetUsd ?? "—"} USD/ngày, tỷ giá ${usdToVnd ?? "—"} VNĐ/USD`,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  res.json(await getSettings());
}
