// Danh sách rule của nhà (FR-7.1). Quyền xem = view_automation (GUEST 403).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireHomeMember } from "../../../homes";
import type { AutomationRule } from "../../domain/automation.types";
import { toRuleDto } from "../../domain/customer-rule.mapper";
import { listRules } from "../../infrastructure/automation-rule.read-model";

export async function listAutomations(auth: AuthContext, homeId: number): Promise<AutomationRule[]> {
  const access = await requireHomeMember(auth, homeId, "view_automation");
  const rows = await listRules(homeId);
  return rows.map((row) => toRuleDto(row, access, auth.userId));
}
