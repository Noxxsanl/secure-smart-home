// Quản lý nhân viên (FR-11.4, ADMIN): tạo Operator, khoá/mở khoá, đặt lại mật khẩu, xoá.
// Không sửa/xoá chính mình hay ADMIN khác (chống tự khoá và leo thang).
import bcrypt from "bcrypt";
import type { RequestMeta } from "../../../lib/clientIp";
import { HttpError, forbidden, notFound } from "../../../lib/http";
import { isDuplicateKeyError } from "../../../lib/db";
import type { AuthContext } from "../../auth/auth.types";
import { logEvent } from "../../logs/logEvent";
import { requireAdmin } from "../common/staff";
import type { StaffAccount } from "../dashboard.types";
import { deleteStaff, getStaff, insertStaff, listStaff, staffUsernameExists, updateStaff } from "./team.repository";

const BCRYPT_COST = 12; // cùng cost với module auth

export async function listTeam(auth: AuthContext): Promise<StaffAccount[]> {
  requireAdmin(auth);
  return listStaff();
}

export async function createStaff(
  auth: AuthContext,
  input: { username: string; password: string; role: "operator" },
  meta: RequestMeta
): Promise<StaffAccount> {
  requireAdmin(auth);
  if (await staffUsernameExists(input.username)) throw new HttpError(409, "USERNAME_TAKEN", "Username is already in use");
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  let id: number;
  try {
    id = await insertStaff({ username: input.username, passwordHash, role: input.role });
  } catch (err) {
    if (isDuplicateKeyError(err, "uq_users_username")) throw new HttpError(409, "USERNAME_TAKEN", "Username is already in use");
    throw err;
  }
  // Không đưa mật khẩu/hash vào log (invariant 2)
  await logEvent({
    eventType: "STAFF_CREATED",
    actorUserId: auth.userId,
    message: `${auth.username} tạo tài khoản ${input.role} "${input.username}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { staff_id: id, role: input.role },
  });
  const created = await getStaff(id);
  if (!created) throw new Error("staff could not be read back");
  return created;
}

/** Tài khoản nhân viên đích: 404 nếu không phải nhân viên; 403 nếu là chính mình hoặc ADMIN khác. */
async function requireManageableTarget(auth: AuthContext, id: number): Promise<StaffAccount> {
  const target = await getStaff(id);
  if (!target) throw notFound("Staff account not found");
  if (target.id === auth.userId) throw forbidden("You cannot modify your own account here");
  if (target.role === "admin") throw forbidden("Admin accounts cannot be modified");
  return target;
}

export async function patchStaff(
  auth: AuthContext,
  id: number,
  patch: { status?: "active" | "locked"; password?: string },
  meta: RequestMeta
): Promise<StaffAccount> {
  requireAdmin(auth);
  const target = await requireManageableTarget(auth, id);
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

export async function removeStaff(auth: AuthContext, id: number, meta: RequestMeta): Promise<void> {
  requireAdmin(auth);
  const target = await requireManageableTarget(auth, id);
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
