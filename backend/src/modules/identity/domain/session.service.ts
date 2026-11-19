// Logic phiên dùng chung: nạp lại người dùng theo token (guards + WebSocket hub), cấp phiên Portal/Mobile, thu hồi
// phiên. Các feature login/register/refresh-session/change-password và guards/ cùng gọi các hàm này.
import pool from "../../../infrastructure/database/pool";
import type { AuthContext } from "../../../core/auth/auth-context";
import type { RequestMeta } from "../../../core/http/request-meta";
import { newUuid, randomTokenBase64Url, sha256Hex } from "../../../shared/crypto";
import type { Queryable } from "../../../infrastructure/database/db";
import { HttpError } from "../../../shared/errors/http-error";
import type { SystemRole } from "../../../shared/types/domain";
import { bumpTokenVersion, findAuthUserById } from "../infrastructure/auth.repository";
import { insertRefreshToken, revokeAllRefreshTokensOfUser } from "../infrastructure/refresh-token.repository";
import type { AuthUserRow, SessionResult, TokenResponse } from "./auth.types";
import { toAuthContext, toMeUser } from "./auth-user.mapper";
import {
  REFRESH_TOKEN_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "./session-tokens";

// ── Cấp phiên ──────────────────────────────────────────────────────────────

/** Cookie phiên Portal cho khách đã xác thực. */
export function createPortalSession(user: AuthUserRow): SessionResult {
  return {
    user: toMeUser(user),
    token: signSessionToken(user, "portal"),
    portal: "user",
    ttlSeconds: SESSION_TTL_SECONDS.portal,
  };
}

// ── Mobile: access token + refresh token xoay vòng ─────────────────────────

export async function issueRefreshToken(
  db: Queryable,
  userId: number,
  familyId: string,
  meta: RequestMeta
): Promise<{ token: string; id: number }> {
  const token = randomTokenBase64Url(32);
  const id = await insertRefreshToken(db, {
    userId,
    tokenHash: sha256Hex(token),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });
  return { token, id };
}

export function buildTokenResponse(user: AuthUserRow, refreshToken: string): TokenResponse {
  return {
    access_token: signSessionToken(user, "access"),
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: SESSION_TTL_SECONDS.access,
    refresh_expires_in: REFRESH_TOKEN_TTL_SECONDS,
    user: toMeUser(user),
  };
}

/** Mở phiên Mobile mới (family_id mới): trả access token + refresh token (bản rõ, chỉ trả lúc này). */
export async function startMobileSession(user: AuthUserRow, meta: RequestMeta): Promise<TokenResponse> {
  const { token } = await issueRefreshToken(pool, user.id, newUuid(), meta);
  return buildTokenResponse(user, token);
}

/**
 * Thu hồi mọi phiên của user — gọi khi đổi mật khẩu (`POST /me/password`) hoặc khoá tài khoản: thu hồi refresh
 * token mobile VÀ tăng token_version để cookie/access token đang chạy mất hiệu lực ngay.
 */
export async function revokeAllRefreshTokens(userId: number): Promise<number> {
  await bumpTokenVersion(userId);
  return revokeAllRefreshTokensOfUser(userId);
}

// ── Xác thực mỗi request (dùng bởi middleware & WebSocket hub) ──────────────

/**
 * Nạp lại người dùng theo token đã verify và chặn tài khoản không còn hợp lệ: không tồn tại hoặc role
 * đã đổi từ lúc cấp token → 401 INVALID_TOKEN; đang bị khoá → 403 ACCOUNT_LOCKED.
 */
export async function loadSessionUser(userId: number, tokenRole: SystemRole, tokenVersion: number): Promise<AuthUserRow> {
  const user = await findAuthUserById(userId);
  // token_version lệch = phiên đã bị thu hồi (đổi mật khẩu, khoá, đăng xuất) → 401 như token sai
  if (!user || user.role !== tokenRole || Number(user.token_version) !== tokenVersion) throw new HttpError(401, "INVALID_TOKEN");
  if (user.status === "locked") throw new HttpError(403, "ACCOUNT_LOCKED");
  return user;
}

/**
 * Xác thực access token Mobile (Bearer). Dùng cho requireMobileUser và cho khung `auth` đầu tiên của
 * WebSocket (CONTRACT §4.3). Trả AuthContext + thời điểm token hết hạn (hub đóng socket 4401 khi đó).
 * Nhân viên cầm access token → 403 USE_DASHBOARD.
 */
export async function authenticateAccessToken(
  token: string
): Promise<{ auth: AuthContext; expiresAt: Date; tokenVersion: number }> {
  const verified = verifySessionToken(token, "access");
  const user = await loadSessionUser(verified.userId, verified.role, verified.tokenVersion);
  if (user.role !== "user") {
    throw new HttpError(403, "USE_DASHBOARD", "Staff accounts must use the dashboard", { role: user.role });
  }
  return { auth: toAuthContext(user, "mobile"), expiresAt: verified.expiresAt, tokenVersion: verified.tokenVersion };
}
