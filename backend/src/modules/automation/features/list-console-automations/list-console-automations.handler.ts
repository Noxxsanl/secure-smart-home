// Automation trên console: read-mostly. OPERATOR chỉ thấy rule của nhà chưa claim + nhà có grant (FR-9.6).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { loadStaffScope } from "../../../homes";
import type { AutomationRuleDto } from "../../domain/console-automation.types";
import { listRules } from "../../infrastructure/console-automation.read-model";

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
