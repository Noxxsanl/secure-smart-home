// Policy kiểm quyền sửa/xoá rule — dùng chung cho update-automation và delete-automation.
// Quyền: sửa/xoá = OWNER mọi rule, CONTROLLER chỉ rule của mình (canEditRule). Nhà suspended → 409 HOME_SUSPENDED.
import type { AuthContext } from "../../../core/auth/auth-context";
import { forbidden, notFound } from "../../../shared/errors/http-error";
import { assertHomeWritable, canEditRule, requireHomeMember } from "../../homes";
import type { HomeAccess } from "../../homes";
import { getRule } from "../infrastructure/automation-rule.read-model";
import type { RuleRow } from "./customer-rule.mapper";

/** Nạp rule + kiểm quyền sửa. Rule của nhà không thuộc quyền → 404; CONTROLLER sửa rule người khác → 403. */
export async function loadEditableRule(auth: AuthContext, ruleId: number): Promise<{ row: RuleRow; access: HomeAccess }> {
  const row = await getRule(ruleId);
  if (!row) throw notFound("Rule not found");
  const access = await requireHomeMember(auth, row.home_id, "create_automation");
  assertHomeWritable(access.home);
  if (!canEditRule(access, row.created_by, auth.userId)) throw forbidden("Only the rule creator or the owner can modify this rule");
  return { row, access };
}
