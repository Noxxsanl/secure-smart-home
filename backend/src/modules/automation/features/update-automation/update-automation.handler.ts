// Sửa rule (FR-7.2): OWNER mọi rule, CONTROLLER chỉ rule của mình (kiểm ở loadEditableRule).
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import type { AutomationRule, RuleInput } from "../../domain/automation.types";
import { toRuleDto } from "../../domain/customer-rule.mapper";
import { loadEditableRule } from "../../domain/rule-access";
import { buildWrite, writeFromRow } from "../../domain/rule-builder";
import { getRule } from "../../infrastructure/automation-rule.read-model";
import { updateRule } from "../../infrastructure/automation-rule.repository";

export async function patchAutomation(auth: AuthContext, ruleId: number, input: RuleInput, meta: RequestMeta): Promise<AutomationRule> {
  const { row, access } = await loadEditableRule(auth, ruleId);
  const write = await buildWrite(row.home_id, writeFromRow(row), input);
  await updateRule(row.id, write);
  await logEvent({
    eventType: "AUTOMATION_UPDATED",
    homeId: row.home_id,
    actorUserId: auth.userId,
    message: `${auth.displayName} cập nhật quy tắc "${write.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { rule_id: row.id, enabled: write.enabled },
  });
  const fresh = await getRule(row.id);
  if (!fresh) throw notFound("Rule not found");
  return toRuleDto(fresh, access, auth.userId);
}
