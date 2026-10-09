// Automation trên console: read-mostly. OPERATOR chỉ thấy rule của nhà chưa claim + nhà có grant (FR-9.6);
// chỉ ADMIN bật/tắt.
import type { RequestMeta } from "../../../lib/clientIp";
import { notFound } from "../../../lib/http";
import type { AuthContext } from "../../auth/auth.types";
import { logEvent } from "../../logs/logEvent";
import { loadStaffScope, requireAdmin } from "../common/staff";
import type { AutomationRuleDto } from "../dashboard.types";
import { getRule, listRules, setRuleEnabled } from "./automation.repository";

export async function listAutomation(auth: AuthContext, homeId: number | undefined): Promise<AutomationRuleDto[]> {
  const scope = await loadStaffScope(auth);
  return listRules(
    { homeId, visibleHomeIds: scope.unrestricted ? undefined : [...scope.grantedHomeIds] },
    auth.role === "admin"
  );
}

/** Rule của nhà trong chi tiết nhà (người gọi đã kiểm grant) — không áp lại scope. */
export async function listAutomationForHome(auth: AuthContext, homeId: number): Promise<AutomationRuleDto[]> {
  return listRules({ homeId }, auth.role === "admin");
}

export async function toggleAutomation(auth: AuthContext, ruleId: number, enabled: boolean, meta: RequestMeta): Promise<AutomationRuleDto> {
  requireAdmin(auth);
  const rule = await getRule(ruleId, true);
  if (!rule) throw notFound("Automation rule not found");
  await setRuleEnabled(ruleId, enabled);
  await logEvent({
    eventType: "AUTOMATION_UPDATED",
    homeId: rule.home_id,
    actorUserId: auth.userId,
    message: `Quản trị viên ${auth.username} ${enabled ? "bật" : "tắt"} quy tắc "${rule.name}" của nhà "${rule.home_name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { rule_id: ruleId, enabled },
  });
  const updated = await getRule(ruleId, true);
  if (!updated) throw notFound("Automation rule not found");
  return updated;
}
