// Xoá tài khoản nhân viên (FR-11.4, chỉ ADMIN).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { logEvent } from "../../../audit";
import { assertManageableTarget } from "../../domain/staff-policy";
import { deleteStaff, getStaff } from "../../infrastructure/staff.repository";

export async function removeStaff(auth: AuthContext, id: number, meta: RequestMeta): Promise<void> {
  requireAdmin(auth);
  const target = assertManageableTarget(auth, await getStaff(id));
  await deleteStaff(id);
  await logEvent({
    eventType: "STAFF_DELETED",
    actorUserId: auth.userId,
    message: `${auth.username} xoá tài khoản ${target.role} "${target.username}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { staff_id: id },
  });
}
