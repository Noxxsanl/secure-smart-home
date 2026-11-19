// Tạo Operator (FR-11.4, chỉ ADMIN).
import bcrypt from "bcrypt";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { isDuplicateKeyError } from "../../../../infrastructure/database/db";
import { HttpError } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import type { StaffAccount } from "../../domain/console-identity.types";
import { BCRYPT_COST } from "../../domain/password-policy";
import { getStaff, insertStaff, staffUsernameExists } from "../../infrastructure/staff.repository";

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
