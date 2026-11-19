// Khoá/mở khoá hoặc đặt lại mật khẩu nhân viên (FR-11.4, chỉ ADMIN).
import bcrypt from "bcrypt";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import type { StaffAccount } from "../../domain/console-identity.types";
import { BCRYPT_COST } from "../../domain/password-policy";
import { assertManageableTarget } from "../../domain/staff-policy";
import { getStaff, updateStaff } from "../../infrastructure/staff.repository";

export async function patchStaff(
  auth: AuthContext,
  id: number,
  patch: { status?: "active" | "locked"; password?: string },
  meta: RequestMeta
): Promise<StaffAccount> {
  requireAdmin(auth);
  const target = assertManageableTarget(auth, await getStaff(id));
  const passwordHash = patch.password === undefined ? undefined : await bcrypt.hash(patch.password, BCRYPT_COST);
  await updateStaff(id, { status: patch.status, passwordHash });

  const changed = [patch.status !== undefined ? "status" : null, patch.password !== undefined ? "password" : null].filter(
    (name): name is string => name !== null
  );
  await logEvent({
    eventType: "STAFF_UPDATED",
    actorUserId: auth.userId,
    message: `${auth.username} cập nhật tài khoản "${target.username}" (${changed.join(", ")})`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    // Chỉ ghi TÊN trường đã đổi, không ghi giá trị mật khẩu
    details: { staff_id: id, changed, status: patch.status ?? null },
  });
  const updated = await getStaff(id);
  if (!updated) throw notFound("Staff account not found");
  return updated;
}
