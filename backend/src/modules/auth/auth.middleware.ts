// Middleware xác thực 3 kênh (CONTRACT_V2 §2). Cả ba gán `req.auth` (AuthContext) và NẠP LẠI người
// dùng ở mỗi request — đổi role / khoá tài khoản có hiệu lực ngay, không phải chờ token hết hạn.
//
//   requireDashboard(...roles)  cookie sh_admin | sh_operator, chỉ ADMIN/OPERATOR (mặc định cả hai)
//   requirePortalUser           cookie sh_user,  chỉ USER
//   requireMobileUser           Authorization: Bearer <access JWT>, chỉ USER
//   csrfGuard(portals)          chỉ kiểm header X-Portal (dùng cho route login/register/logout chưa có phiên)
//
// Lỗi: 401 NO_TOKEN | INVALID_TOKEN | TOKEN_EXPIRED · 403 ACCOUNT_LOCKED · 403 USE_MOBILE_APP (USER trên
// dashboard) · 403 USE_DASHBOARD (nhân viên trên portal/mobile) · 403 FORBIDDEN (sai role) ·
// 403 CSRF_CHECK_FAILED (thiếu/sai X-Portal trên POST/PUT/PATCH/DELETE của kênh cookie).
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { HttpError, forbidden } from "../../lib/http";
import { STAFF_ROLES, type StaffRole } from "../../types/domain";
import type { PortalName } from "./auth.types";
import { SESSION_COOKIE, isPortalName, readCookie } from "./auth.cookies";
import { authenticateAccessToken, loadSessionUser } from "./auth.service";
import { verifySessionToken } from "./auth.tokens";
import { toAuthContext } from "./authContext";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Giá trị header X-Portal (chữ thường) hoặc null nếu không gửi. */
export function readPortalHeader(req: Request): string | null {
  const value = req.get("x-portal");
  return value ? value.trim().toLowerCase() : null;
}

/**
 * Phòng thủ chiều sâu chống CSRF cho kênh cookie (SameSite=Strict là lớp chính): request thay đổi
 * dữ liệu BẮT BUỘC có X-Portal hợp lệ cho kênh — header tuỳ biến không gửi được từ form/img cross-site.
 * Trả portal đã khai báo, hoặc null khi GET/HEAD không gửi header.
 */
export function checkPortalHeader(req: Request, allowed: readonly PortalName[]): PortalName | null {
  const header = readPortalHeader(req);
  if (header === null) {
    if (UNSAFE_METHODS.has(req.method)) throw new HttpError(403, "CSRF_CHECK_FAILED", "X-Portal header is required");
    return null;
  }
  if (!isPortalName(header) || !allowed.includes(header)) {
    throw new HttpError(403, "CSRF_CHECK_FAILED", "X-Portal header does not match this channel");
  }
  return header;
}

/** Middleware chỉ kiểm X-Portal — gắn ở router của route chưa đăng nhập (login/register/logout). */
export function csrfGuard(allowed: readonly PortalName[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    checkPortalHeader(req, allowed);
    next();
  };
}

/** Cookie phiên đầu tiên có mặt trong danh sách tên. */
function firstCookie(req: Request, names: readonly string[]): string | null {
  for (const name of names) {
    const value = readCookie(req, name);
    if (value) return value;
  }
  return null;
}

/**
 * Kênh Dashboard. X-Portal chọn cookie `sh_<portal>`; thiếu header (chỉ cho GET) thì thử sh_admin rồi
 * sh_operator. USER cầm phiên dashboard → 403 USE_MOBILE_APP (FR-1.4).
 */
export function requireDashboard(...roles: StaffRole[]): RequestHandler {
  const allowedRoles: readonly StaffRole[] = roles.length > 0 ? roles : STAFF_ROLES;
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const portal = checkPortalHeader(req, ["admin", "operator"]);
    const token = firstCookie(req, portal ? [SESSION_COOKIE[portal]] : [SESSION_COOKIE.admin, SESSION_COOKIE.operator]);
    if (!token) throw new HttpError(401, "NO_TOKEN");

    const verified = verifySessionToken(token, "dashboard");
    const user = await loadSessionUser(verified.userId, verified.role, verified.tokenVersion);
    if (user.role === "user") throw new HttpError(403, "USE_MOBILE_APP", "Customer accounts must use the mobile app", { role: "user" });
    if (!(allowedRoles as readonly string[]).includes(user.role)) throw forbidden("Role is not allowed for this endpoint");

    req.auth = toAuthContext(user, "dashboard");
    next();
  };
}

/** Kênh Portal (web khách hàng): cookie `sh_user`, chỉ USER. Nhân viên → 403 USE_DASHBOARD. */
export const requirePortalUser: RequestHandler = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  checkPortalHeader(req, ["user"]);
  const token = readCookie(req, SESSION_COOKIE.user);
  if (!token) throw new HttpError(401, "NO_TOKEN");

  const verified = verifySessionToken(token, "portal");
  const user = await loadSessionUser(verified.userId, verified.role, verified.tokenVersion);
  if (user.role !== "user") throw new HttpError(403, "USE_DASHBOARD", "Staff accounts must use the dashboard", { role: user.role });

  req.auth = toAuthContext(user, "portal");
  next();
};

/** Kênh Mobile: `Authorization: Bearer <access JWT>`, chỉ USER. Client refresh 1 lần khi gặp 401 (trừ /auth/*). */
export const requireMobileUser: RequestHandler = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const header = req.get("authorization");
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header.trim()) : null;
  if (!match) throw new HttpError(401, "NO_TOKEN");

  const { auth } = await authenticateAccessToken(match[1]);
  req.auth = auth;
  next();
};
