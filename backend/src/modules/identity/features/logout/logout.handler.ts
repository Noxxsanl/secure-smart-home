// Đăng xuất: kênh cookie (Dashboard/Portal) và Mobile (refresh token).
import type { AuthChannel } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import pool from "../../../../infrastructure/database/pool";
import { sha256Hex } from "../../../../shared/crypto";
import { logEvent } from "../../../audit";
import { metaFields } from "../../domain/auth-request";
import { peekSessionUserId, type SessionTokenType } from "../../domain/session-tokens";
import { bumpTokenVersion } from "../../infrastructure/auth.repository";
import {
  findRefreshTokenByHash,
  revokeAllRefreshTokensOfUser,
  revokeRefreshFamily,
} from "../../infrastructure/refresh-token.repository";

/**
 * Đăng xuất Mobile: thu hồi cả họ refresh token (FR-1.5). Không cần access token còn hạn. Token lạ →
 * im lặng coi như đã đăng xuất (idempotent, không cho dò token).
 */
export async function logoutMobileSession(refreshToken: string, meta: RequestMeta): Promise<void> {
  const row = await findRefreshTokenByHash(sha256Hex(refreshToken));
  if (!row) return;
  await revokeRefreshFamily(pool, row.family_id);
  await logEvent({
    eventType: "LOGOUT",
    actorUserId: row.user_id,
    message: "Đăng xuất Mobile",
    ...metaFields(meta),
    details: { channel: "mobile" },
  });
}

/**
 * Đăng xuất kênh cookie: tăng token_version (vô hiệu MỌI phiên cookie/access token của user — đơn giản và
 * chấp nhận được) rồi ghi audit LOGOUT. Nhận token (có thể đã hết hạn nhưng đúng chữ ký) để biết ai đăng xuất.
 * Refresh token mobile cũng bị thu hồi để "đăng xuất" thật sự là đăng xuất mọi nơi.
 */
export async function auditCookieLogout(token: string | null, typ: SessionTokenType, channel: AuthChannel, meta: RequestMeta): Promise<void> {
  const userId = token ? peekSessionUserId(token, typ) : null;
  if (userId === null) return;
  await bumpTokenVersion(userId);
  await revokeAllRefreshTokensOfUser(userId);
  await logEvent({
    eventType: "LOGOUT",
    actorUserId: userId,
    message: `Đăng xuất (${channel})`,
    ...metaFields(meta),
    details: { channel },
  });
}
