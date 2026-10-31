// Đăng ký khách hàng (Portal/Mobile).
import bcrypt from "bcrypt";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { isDuplicateKeyError, withTransaction } from "../../../../infrastructure/database/db";
import { HttpError } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import type { AuthUserRow } from "../../domain/auth.types";
import { metaFields } from "../../domain/auth-request";
import { BCRYPT_COST } from "../../domain/password-policy";
import { createUserWithCustomer, findAuthUserById } from "../../infrastructure/auth.repository";
import type { RegisterInput } from "./register.dto";

/**
 * Đăng ký khách hàng (Portal/Mobile): users + customers trong MỘT transaction (invariant 9),
 * user_tag duy nhất. Email đã có → 409 EMAIL_TAKEN. Trả người dùng vừa tạo (chưa đăng nhập —
 * controller cấp phiên tiếp).
 */
export async function registerCustomer(input: RegisterInput, channel: "portal" | "mobile", meta: RequestMeta): Promise<AuthUserRow> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  let userId: number;
  try {
    const created = await withTransaction((conn) =>
      createUserWithCustomer(conn, {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        phone: input.phone,
      })
    );
    userId = created.userId;
  } catch (err) {
    if (isDuplicateKeyError(err, "uq_users_email")) throw new HttpError(409, "EMAIL_TAKEN", "Email is already registered");
    throw err;
  }

  await logEvent({
    eventType: "REGISTER",
    actorUserId: userId,
    message: "Khách hàng đăng ký tài khoản mới",
    ...metaFields(meta),
    details: { channel },
  });

  const user = await findAuthUserById(userId);
  if (!user) throw new Error("registerCustomer: created user could not be read back");
  return user;
}
