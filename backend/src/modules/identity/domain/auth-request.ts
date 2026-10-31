// Tiện ích đọc request dùng chung cho các feature xác thực (login, register, logout, refresh-session).
import type { Request } from "express";
import type { RequestMeta } from "../../../core/http/request-meta";
import { requireString } from "../../../shared/validation/validate";

export function bodyOf(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

/** refresh_token trong body của /mobile/auth/refresh và /mobile/auth/logout (chuỗi ngẫu nhiên, không trim). */
export function parseRefreshTokenBody(req: Request): string {
  return requireString(bodyOf(req).refresh_token, "refresh_token", { min: 1, max: 256, trim: false });
}

/** ip + user-agent cho `logEvent` (audit không bao giờ chứa mật khẩu/token). */
export function metaFields(meta: RequestMeta): { ip: string | null; userAgent: string | null } {
  return { ip: meta.ip, userAgent: meta.userAgent };
}
