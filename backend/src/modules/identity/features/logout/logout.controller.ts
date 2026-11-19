// Controller đăng xuất 3 kênh. Dashboard/Portal: ghi audit + xoá cookie; Mobile: thu hồi refresh token.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseRefreshTokenBody } from "../../domain/auth-request";
import { readPortalHeader } from "../../guards/auth.guards";
import { SESSION_COOKIE, clearSessionCookie, isPortalName, readCookie } from "../../guards/session-cookies";
import { auditCookieLogout, logoutMobileSession } from "./logout.handler";

/** POST /api/dashboard/auth/logout → 204, xoá cookie sh_<X-Portal>. */
export async function dashboardLogoutController(req: Request, res: Response): Promise<void> {
  const header = readPortalHeader(req);
  const portal = header !== null && isPortalName(header) && header !== "user" ? header : null;
  if (portal) {
    await auditCookieLogout(readCookie(req, SESSION_COOKIE[portal]), "dashboard", "dashboard", requestMeta(req));
    clearSessionCookie(res, portal);
  } else {
    // Không biết đang ở portal nào → xoá cả hai cookie nhân viên cho chắc
    clearSessionCookie(res, "admin");
    clearSessionCookie(res, "operator");
  }
  res.status(204).end();
}

/** POST /api/portal/auth/logout → 204 */
export async function portalLogoutController(req: Request, res: Response): Promise<void> {
  await auditCookieLogout(readCookie(req, SESSION_COOKIE.user), "portal", "portal", requestMeta(req));
  clearSessionCookie(res, "user");
  res.status(204).end();
}

/** POST /api/mobile/auth/logout  body { refresh_token } → 204 (không cần access token còn hạn) */
export async function mobileLogoutController(req: Request, res: Response): Promise<void> {
  const refreshToken = parseRefreshTokenBody(req);
  await logoutMobileSession(refreshToken, requestMeta(req));
  res.status(204).end();
}
