// Bật/tắt rule trên console: chỉ ADMIN (OPERATOR chỉ xem).
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { requireAdmin } from "../../../../core/auth/roles";
import { notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import type { AutomationRuleDto } from "../../domain/console-automation.types";
import { getRule } from "../../infrastructure/console-automation.read-model";
import { setRuleEnabled } from "../../infrastructure/automation-rule.repository";

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
