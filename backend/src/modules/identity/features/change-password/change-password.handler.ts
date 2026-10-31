// Đổi mật khẩu của khách (CONTRACT §4.2 Profile).
import bcrypt from "bcrypt";
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { BCRYPT_COST } from "../../domain/password-policy";
import { revokeAllRefreshTokens } from "../../domain/session.service";
import { findPasswordHash, updatePasswordHash } from "../../infrastructure/profile.repository";

// Hash hợp lệ về cú pháp, không khớp mật khẩu nào — để so sánh thời gian không đổi khi thiếu hash
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5bZ7pU3m0vZ1p2m0b8x3kQ0y9W5vXaK";

export async function changePassword(auth: AuthContext, current: string, next: string, meta: RequestMeta): Promise<void> {
  const hash = await findPasswordHash(auth.userId);
  const ok = await bcrypt.compare(current, hash ?? DUMMY_HASH);
  if (!hash || !ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Current password is incorrect");

  await updatePasswordHash(auth.userId, await bcrypt.hash(next, BCRYPT_COST));
  // Đổi mật khẩu → mọi phiên mobile cũ phải đăng nhập lại (refresh token bị thu hồi)
  await revokeAllRefreshTokens(auth.userId);
  await logEvent({
    eventType: "PASSWORD_CHANGED",
    actorUserId: auth.userId,
    message: "Khách hàng đã đổi mật khẩu",
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}
