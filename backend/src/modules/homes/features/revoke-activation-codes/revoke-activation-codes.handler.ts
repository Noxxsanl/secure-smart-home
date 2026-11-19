// POST /smart-homes/:id/activation-codes/revoke — thu hồi mọi mã chưa dùng của nhà (FR-2.4, 2.6).
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { withTransaction } from "../../../../infrastructure/database/db";
import { logEvent } from "../../../audit";
import { revokeActivationCodes } from "../../domain/activation";
import { requireHome } from "../../domain/smart-home-detail";

export async function revokeActivation(auth: AuthContext, homeId: number, meta: RequestMeta): Promise<void> {
  const home = await requireHome(homeId);
  const revoked = await withTransaction((conn) => revokeActivationCodes(conn, homeId, auth.userId));
  if (revoked === 0) return; // không có mã nào đang hiệu lực: idempotent, không ghi audit
  await logEvent({
    eventType: "ACTIVATION_CODE_REVOKED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.username} thu hồi mã kích hoạt của nhà "${home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { revoked },
  });
}
