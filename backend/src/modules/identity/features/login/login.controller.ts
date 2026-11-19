// Controller đăng nhập 3 kênh: parse + validate input → loginDashboard/loginCustomer → cấp phiên → trả HTTP (CONTRACT_V2 §2).
// Lỗi nghiệp vụ là HttpError, được error filter (core/filters) đổi thành `{ error, detail?, … }`.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { setSessionCookie } from "../../guards/session-cookies";
import { createPortalSession, startMobileSession } from "../../domain/session.service";
import { parseCustomerLogin, parseDashboardLogin } from "./login.dto";
import { loginCustomer, loginDashboard } from "./login.handler";

/** POST /api/dashboard/auth/login  body { username, password, portal } → { user } + cookie sh_<portal> */
export async function dashboardLoginController(req: Request, res: Response): Promise<void> {
  const input = parseDashboardLogin(req);
  const session = await loginDashboard(input, requestMeta(req));
  setSessionCookie(res, session.portal, session.token, session.ttlSeconds);
  res.json({ user: session.user });
}

/** POST /api/portal/auth/login  body { email (hoặc user_tag), password } → { user } + cookie sh_user */
export async function portalLoginController(req: Request, res: Response): Promise<void> {
  const { identifier, password } = parseCustomerLogin(req);
  const user = await loginCustomer(identifier, password, "portal", requestMeta(req));
  const session = createPortalSession(user);
  setSessionCookie(res, session.portal, session.token, session.ttlSeconds);
  res.json({ user: session.user });
}

/** POST /api/mobile/auth/login  body { email (hoặc user_tag), password } → 200 TokenResponse */
export async function mobileLoginController(req: Request, res: Response): Promise<void> {
  const { identifier, password } = parseCustomerLogin(req);
  const meta = requestMeta(req);
  const user = await loginCustomer(identifier, password, "mobile", meta);
  res.json(await startMobileSession(user, meta));
}
