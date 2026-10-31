import type { PortalConfig, UserRole } from "./types";

// ---------------------------------------------------------------------------
// Hằng số phiên đăng nhập dùng chung cho client (AuthProvider, trang login) và
// proxy phía server. File này KHÔNG import `next/server` để client bundle nhẹ.
// ---------------------------------------------------------------------------

// Cookie HttpOnly theo cổng (CONTRACT §2). 3 app dev cùng chạy trên host
// `localhost` (khác cổng) nên mỗi role một tên cookie để không ghi đè nhau.
// JS phía client không đọc được giá trị — proxy chỉ kiểm tra cookie có tồn tại.
export const SESSION_COOKIES: Record<UserRole, string> = {
  admin: "sh_admin",
  operator: "sh_operator",
  user: "sh_user",
};

// Khi client tự đưa người dùng về trang đăng nhập (đăng xuất, phiên hết hạn,
// tài khoản bị khoá), URL kèm `?reauth=<lý do>`. Proxy thấy tham số này thì
// KHÔNG chuyển ngược về trang chủ dù cookie cũ còn — tránh vòng lặp
// /login ⇄ trang chủ khi cookie tồn tại nhưng backend đã coi phiên là vô hiệu.
export const REAUTH_PARAM = "reauth";

export type SessionEndReason = "logout" | "expired" | "locked" | "offline";

export const SESSION_END_REASONS: readonly SessionEndReason[] = ["logout", "expired", "locked", "offline"];

export function reauthLoginPath(portal: Pick<PortalConfig, "loginPath">, reason: SessionEndReason): string {
  return `${portal.loginPath}?${REAUTH_PARAM}=${reason}`;
}

export function parseSessionEndReason(value: string | null): SessionEndReason | null {
  return SESSION_END_REASONS.find((r) => r === value) ?? null;
}
