// Controller xác thực: parse + validate input → gọi auth.service → trả HTTP (CONTRACT_V2 §2).
// Lỗi nghiệp vụ là HttpError, được error middleware trong app.ts đổi thành `{ error, detail?, … }`.
import type { Request, Response } from "express";
import { requestMeta } from "../../lib/clientIp";
import { HttpError } from "../../lib/http";
import {
  optionalEnum,
  optionalString,
  requireEmail,
  requireString,
  type StringRule,
} from "../../lib/validate";
import { STAFF_ROLES, type StaffRole } from "../../types/domain";
import { SESSION_COOKIE, clearSessionCookie, isPortalName, readCookie, setSessionCookie } from "./auth.cookies";
import {
  auditCookieLogout,
  createPortalSession,
  loginCustomer,
  loginDashboard,
  logoutMobileSession,
  refreshMobileSession,
  registerCustomer,
  startMobileSession,
  type RegisterInput,
} from "./auth.service";
import { readPortalHeader } from "./auth.middleware";
import { authToMeUser, getAuth } from "./authContext";

function bodyOf(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

// Mật khẩu: khoảng trắng là ký tự hợp lệ (trim: false). Đăng nhập chỉ cần không rỗng; đăng ký 8–128.
const LOGIN_PASSWORD_RULE: StringRule = { min: 1, max: 128, trim: false };
const NEW_PASSWORD_RULE: StringRule = { min: 8, max: 128, trim: false };
const LOGIN_NAME_RULE: StringRule = { min: 1, max: 190 };
const PHONE_RULE: StringRule = { min: 1, max: 20, pattern: /^[0-9 +.-]+$/ };

function parseRegister(req: Request): RegisterInput {
  const body = bodyOf(req);
  return {
    email: requireEmail(body.email),
    password: requireString(body.password, "password", NEW_PASSWORD_RULE),
    fullName: requireString(body.full_name, "full_name", { min: 2, max: 128 }),
    phone: optionalString(body.phone, "phone", PHONE_RULE) ?? null,
  };
}

// ── Dashboard ──────────────────────────────────────────────────────────────

/** POST /api/dashboard/auth/login  body { username, password, portal } */
export async function dashboardLogin(req: Request, res: Response): Promise<void> {
  const body = bodyOf(req);
  const identifier = requireString(body.username, "username", LOGIN_NAME_RULE);
  const password = requireString(body.password, "password", LOGIN_PASSWORD_RULE);

  // portal lấy từ body; nếu client chỉ gửi header X-Portal thì dùng header
  let portal: StaffRole | undefined = optionalEnum(body.portal, "portal", STAFF_ROLES);
  if (portal === undefined) {
    const header = readPortalHeader(req);
    portal = header !== null && (STAFF_ROLES as readonly string[]).includes(header) ? (header as StaffRole) : undefined;
  }
  if (portal === undefined) throw new HttpError(400, "MISSING_FIELDS", "portal is required");

  const session = await loginDashboard({ identifier, password, portal }, requestMeta(req));
  setSessionCookie(res, session.portal, session.token, session.ttlSeconds);
  res.json({ user: session.user });
}

/** POST /api/dashboard/auth/logout → 204, xoá cookie sh_<X-Portal>. */
export async function dashboardLogout(req: Request, res: Response): Promise<void> {
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

// ── Portal (web khách hàng) ────────────────────────────────────────────────

/** POST /api/portal/auth/register → 201 { user } + cookie sh_user */
export async function portalRegister(req: Request, res: Response): Promise<void> {
  const meta = requestMeta(req);
  const user = await registerCustomer(parseRegister(req), "portal", meta);
  const session = createPortalSession(user);
  setSessionCookie(res, session.portal, session.token, session.ttlSeconds);
  res.status(201).json({ user: session.user });
}

/** POST /api/portal/auth/login  body { email (hoặc user_tag), password } */
export async function portalLogin(req: Request, res: Response): Promise<void> {
  const body = bodyOf(req);
  const identifier = requireString(body.email, "email", LOGIN_NAME_RULE);
  const password = requireString(body.password, "password", LOGIN_PASSWORD_RULE);
  const user = await loginCustomer(identifier, password, "portal", requestMeta(req));
  const session = createPortalSession(user);
  setSessionCookie(res, session.portal, session.token, session.ttlSeconds);
  res.json({ user: session.user });
}

/** POST /api/portal/auth/logout → 204 */
export async function portalLogout(req: Request, res: Response): Promise<void> {
  await auditCookieLogout(readCookie(req, SESSION_COOKIE.user), "portal", "portal", requestMeta(req));
  clearSessionCookie(res, "user");
  res.status(204).end();
}

// ── Mobile ─────────────────────────────────────────────────────────────────

/** POST /api/mobile/auth/register → 201 TokenResponse */
export async function mobileRegister(req: Request, res: Response): Promise<void> {
  const meta = requestMeta(req);
  const user = await registerCustomer(parseRegister(req), "mobile", meta);
  res.status(201).json(await startMobileSession(user, meta));
}

/** POST /api/mobile/auth/login  body { email (hoặc user_tag), password } → 200 TokenResponse */
export async function mobileLogin(req: Request, res: Response): Promise<void> {
  const body = bodyOf(req);
  const identifier = requireString(body.email, "email", LOGIN_NAME_RULE);
  const password = requireString(body.password, "password", LOGIN_PASSWORD_RULE);
  const meta = requestMeta(req);
  const user = await loginCustomer(identifier, password, "mobile", meta);
  res.json(await startMobileSession(user, meta));
}

/** POST /api/mobile/auth/refresh  body { refresh_token } → 200 TokenResponse */
export async function mobileRefresh(req: Request, res: Response): Promise<void> {
  const refreshToken = requireString(bodyOf(req).refresh_token, "refresh_token", { min: 1, max: 256, trim: false });
  res.json(await refreshMobileSession(refreshToken, requestMeta(req)));
}

/** POST /api/mobile/auth/logout  body { refresh_token } → 204 (không cần access token còn hạn) */
export async function mobileLogout(req: Request, res: Response): Promise<void> {
  const refreshToken = requireString(bodyOf(req).refresh_token, "refresh_token", { min: 1, max: 256, trim: false });
  await logoutMobileSession(refreshToken, requestMeta(req));
  res.status(204).end();
}

// ── Chung ──────────────────────────────────────────────────────────────────

/** GET /…/auth/me → { user } từ req.auth (đã nạp lại từ DB bởi middleware). */
export function me(req: Request, res: Response): void {
  res.json({ user: authToMeUser(getAuth(req)) });
}
