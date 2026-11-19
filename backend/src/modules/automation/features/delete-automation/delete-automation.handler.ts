// Xoá rule (FR-7.2): OWNER mọi rule, CONTROLLER chỉ rule của mình (kiểm ở loadEditableRule).
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { logEvent } from "../../../audit";
import { loadEditableRule } from "../../domain/rule-access";
import { deleteRule } from "../../infrastructure/automation-rule.repository";

export async function deleteAutomation(auth: AuthContext, ruleId: number, meta: RequestMeta): Promise<void> {
  const { row } = await loadEditableRule(auth, ruleId);
  await deleteRule(row.id);
  await logEvent({
    eventType: "AUTOMATION_DELETED",
    homeId: row.home_id,
    actorUserId: auth.userId,
    message: `${auth.displayName} xoá quy tắc "${row.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { rule_id: row.id },
  });
}
