// Tạo rule (FR-7.1). Quyền = create_automation; nhà suspended → 409 HOME_SUSPENDED.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import pool from "../../../../infrastructure/database/pool";
import { notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { assertHomeWritable, requireHomeMember } from "../../../homes";
import type { AutomationRule, RuleInput } from "../../domain/automation.types";
import { toRuleDto } from "../../domain/customer-rule.mapper";
import { buildWrite } from "../../domain/rule-builder";
import { getRule } from "../../infrastructure/automation-rule.read-model";
import { insertRule } from "../../infrastructure/automation-rule.repository";

export async function createAutomation(auth: AuthContext, homeId: number, input: RuleInput, meta: RequestMeta): Promise<AutomationRule> {
  const access = await requireHomeMember(auth, homeId, "create_automation");
  assertHomeWritable(access.home);
  const write = await buildWrite(homeId, null, input);
  const id = await insertRule(pool, { ...write, homeId, createdBy: auth.userId, origin: "user" });
  await logEvent({
    eventType: "AUTOMATION_CREATED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.displayName} tạo quy tắc "${write.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { rule_id: id, trigger_type: write.triggerType },
  });
  const row = await getRule(id);
  if (!row) throw notFound("Rule not found");
  return toRuleDto(row, access, auth.userId);
}
