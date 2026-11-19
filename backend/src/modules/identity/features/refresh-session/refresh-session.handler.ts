// Mobile: đổi refresh token lấy cặp token mới (xoay vòng).
import type { RequestMeta } from "../../../../core/http/request-meta";
import { withTransaction } from "../../../../infrastructure/database/db";
import { sha256Hex } from "../../../../shared/crypto";
import { HttpError } from "../../../../shared/errors/http-error";
import type { SystemRole } from "../../../../shared/types/domain";
import { logEvent } from "../../../audit";
import type { AuthUserRow, TokenResponse } from "../../domain/auth.types";
import { metaFields } from "../../domain/auth-request";
import { buildTokenResponse, issueRefreshToken } from "../../domain/session.service";
import { findAuthUserById } from "../../infrastructure/auth.repository";
import {
  findRefreshTokenByHash,
  markRefreshTokenRotated,
  revokeRefreshFamily,
} from "../../infrastructure/refresh-token.repository";

type RefreshOutcome =
  | { kind: "ok"; user: AuthUserRow; refreshToken: string }
  | { kind: "unknown" }
  | { kind: "expired" }
  | { kind: "reused"; userId: number }
  | { kind: "locked"; userId: number }
  | { kind: "wrong_role"; userId: number; role: SystemRole };

/**
 * Đổi refresh token lấy cặp token mới (xoay vòng). Token cũ bị thu hồi và trỏ `replaced_by_id` sang
 * token mới. Dùng lại token ĐÃ thu hồi (kẻ trộm hoặc client lỗi) → thu hồi CẢ họ token + audit
 * REFRESH_TOKEN_REUSED (critical) + 401 REFRESH_TOKEN_REUSED. Client phải gọi refresh đơn luồng
 * (single-flight): hai refresh song song cùng một token sẽ bị coi là dùng lại.
 */
export async function refreshMobileSession(refreshToken: string, meta: RequestMeta): Promise<TokenResponse> {
  const tokenHash = sha256Hex(refreshToken);

  // Quyết định trong transaction, nhưng THROW sau khi commit — nếu throw trong transaction thì
  // việc thu hồi họ token (cần được giữ lại) cũng bị rollback.
  const outcome = await withTransaction<RefreshOutcome>(async (conn) => {
    const row = await findRefreshTokenByHash(tokenHash, conn, true);
    if (!row) return { kind: "unknown" };

    if (row.is_revoked) {
      await revokeRefreshFamily(conn, row.family_id);
      return { kind: "reused", userId: row.user_id };
    }
    if (row.is_expired) return { kind: "expired" };

    const user = await findAuthUserById(row.user_id, conn);
    if (!user) return { kind: "unknown" };
    if (user.status === "locked") {
      await revokeRefreshFamily(conn, row.family_id);
      return { kind: "locked", userId: user.id };
    }
    if (user.role !== "user") return { kind: "wrong_role", userId: user.id, role: user.role };

    const next = await issueRefreshToken(conn, row.user_id, row.family_id, meta);
    await markRefreshTokenRotated(conn, row.id, next.id);
    return { kind: "ok", user, refreshToken: next.token };
  });

  switch (outcome.kind) {
    case "ok":
      return buildTokenResponse(outcome.user, outcome.refreshToken);
    case "unknown":
      throw new HttpError(401, "INVALID_REFRESH_TOKEN");
    case "expired":
      throw new HttpError(401, "REFRESH_TOKEN_EXPIRED");
    case "locked":
      throw new HttpError(403, "ACCOUNT_LOCKED");
    case "wrong_role":
      throw new HttpError(403, "USE_DASHBOARD", "Staff accounts must use the dashboard", { role: outcome.role });
    case "reused":
      await logEvent({
        eventType: "REFRESH_TOKEN_REUSED",
        actorUserId: outcome.userId,
        message: "Phát hiện dùng lại refresh token đã thu hồi — đã thu hồi toàn bộ phiên đăng nhập liên quan",
        ...metaFields(meta),
        details: { channel: "mobile" },
      });
      throw new HttpError(401, "REFRESH_TOKEN_REUSED");
  }
}
