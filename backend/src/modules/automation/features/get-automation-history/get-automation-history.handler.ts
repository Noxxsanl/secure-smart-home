// Lịch sử chạy của một rule. Quyền xem = view_automation (GUEST 403); rule của nhà không thuộc quyền → 404.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { toIsoRequired } from "../../../../infrastructure/database/db";
import { notFound } from "../../../../shared/errors/http-error";
import { requireHomeMember } from "../../../homes";
import { getRule } from "../../infrastructure/automation-rule.read-model";
import { listHistory } from "../../infrastructure/automation-rule.repository";
import { parseDetails, type HistoryEntry } from "./get-automation-history.dto";

export async function getAutomationHistory(auth: AuthContext, ruleId: number, limit: number): Promise<HistoryEntry[]> {
  const row = await getRule(ruleId);
  if (!row) throw notFound("Rule not found");
  await requireHomeMember(auth, row.home_id, "view_automation");
  const rows = await listHistory(ruleId, limit);
  return rows.map((item) => ({
    id: item.id,
    triggered_at: toIsoRequired(item.triggered_at),
    result: item.result,
    details: parseDetails(item.details),
  }));
}
