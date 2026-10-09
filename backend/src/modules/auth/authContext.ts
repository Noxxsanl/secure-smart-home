// Truy cập `req.auth` có kiểu. Handler phía sau requireDashboard/requirePortalUser/requireMobileUser
// luôn dùng getAuth(req) — không `(req as any).user`, không đọc req.auth trực tiếp (có thể undefined).
import type { Request } from "express";
import { HttpError } from "../../lib/http";
import type { AuthChannel, AuthContext, AuthUserRow, MeUser } from "./auth.types";

/** Trả AuthContext của request; chưa xác thực (lỗi lắp middleware) → 401 NO_TOKEN. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw new HttpError(401, "NO_TOKEN", "Authentication required");
  return req.auth;
}

/** username hiển thị: username (nhân viên) → email (khách) → "user-<id>" (không bao giờ rỗng). */
function loginName(row: AuthUserRow): string {
  return row.username ?? row.email ?? `user-${row.id}`;
}

export function toAuthContext(row: AuthUserRow, channel: AuthChannel): AuthContext {
  return {
    userId: row.id,
    role: row.role,
    customerId: row.customer_id,
    username: loginName(row),
    email: row.email,
    displayName: row.full_name ?? loginName(row),
    channel,
    userTag: row.user_tag,
  };
}

export function toMeUser(row: AuthUserRow): MeUser {
  return {
    id: row.id,
    role: row.role,
    username: loginName(row),
    email: row.email,
    display_name: row.full_name ?? loginName(row),
    customer_id: row.customer_id,
    user_tag: row.user_tag,
  };
}

/** MeUser từ req.auth (không cần truy vấn lại) — dùng cho các endpoint /me. */
export function authToMeUser(auth: AuthContext): MeUser {
  return {
    id: auth.userId,
    role: auth.role,
    username: auth.username,
    email: auth.email,
    display_name: auth.displayName,
    customer_id: auth.customerId,
    user_tag: auth.userTag,
  };
}
