// Cookie phiên của kênh Dashboard/Portal (CONTRACT_V2 §2): HttpOnly, SameSite=Strict, Path=/,
// thêm Secure khi COOKIE_SECURE=true (mặc định bật ở production). Mỗi portal một tên cookie riêng
// (`sh_admin` / `sh_operator` / `sh_user`) vì cookie KHÔNG phân biệt cổng: 3 app dev trên
// localhost:3001/3002/3003 dùng chung host nên nếu cùng tên sẽ ghi đè phiên của nhau.
import type { CookieOptions, Request, Response } from "express";
import { env } from "../../../config/env";
import type { PortalName } from "../../../core/auth/auth-context";

export const PORTAL_NAMES: readonly PortalName[] = ["admin", "operator", "user"];

export const SESSION_COOKIE: Readonly<Record<PortalName, string>> = {
  admin: "sh_admin",
  operator: "sh_operator",
  user: "sh_user",
};

export function isPortalName(value: string): value is PortalName {
  return (PORTAL_NAMES as readonly string[]).includes(value);
}

/**
 * Đọc giá trị cookie theo tên. Parse tay (không thêm cookie-parser) giống modules/legacy/middleware/verify-jwt.ts;
 * so khớp đúng `name=` nên `sh_admin` không khớp nhầm `sh_admin_x`.
 */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(`${name}=`)) {
      const value = entry.slice(name.length + 1);
      return value || null;
    }
  }
  return null;
}

function baseOptions(): CookieOptions {
  return { httpOnly: true, sameSite: "strict", secure: env.cookieSecure, path: "/" };
}

export function setSessionCookie(res: Response, portal: PortalName, token: string, ttlSeconds: number): void {
  res.cookie(SESSION_COOKIE[portal], token, { ...baseOptions(), maxAge: ttlSeconds * 1000 });
}

/** Xoá cookie: phải dùng đúng path/sameSite/secure như lúc đặt thì trình duyệt mới xoá. */
export function clearSessionCookie(res: Response, portal: PortalName): void {
  res.clearCookie(SESSION_COOKIE[portal], baseOptions());
}
