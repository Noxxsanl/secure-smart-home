// Dòng người dùng (AuthUserRow) → AuthContext (req.auth) và MeUser (phản hồi login/register/me).
// Handler phía sau requireDashboard/requirePortalUser/requireMobileUser đọc AuthContext bằng getAuth(req)
// (core/auth/auth-context.ts) — không `(req as any).user`, không đọc req.auth trực tiếp (có thể undefined).
import type { AuthChannel, AuthContext } from "../../../core/auth/auth-context";
import type { AuthUserRow, MeUser } from "./auth.types";

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
