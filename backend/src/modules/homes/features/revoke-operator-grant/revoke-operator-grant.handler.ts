// POST /operator-access/:id/revoke — thu hồi grant (FR-9.6). ADMIN thu hồi mọi grant; Operator chỉ thu hồi
// grant của chính mình (grant người khác → 404, không lộ sự tồn tại).
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { HttpError, notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import type { OperatorAccessGrant } from "../../domain/console-home.types";
import { getGrantById } from "../../infrastructure/operator-access.read-model";
import { markGrantRevoked } from "../../infrastructure/operator-access.repository";

/** ADMIN thu hồi mọi grant; Operator chỉ thu hồi grant của chính mình. */
export async function revokeGrant(auth: AuthContext, grantId: number, meta: RequestMeta): Promise<OperatorAccessGrant> {
  const grant = await getGrantById(grantId);
  // Grant của người khác với Operator → 404 (không lộ sự tồn tại)
  if (!grant || (auth.role !== "admin" && grant.operator_id !== auth.userId)) throw notFound("Grant not found");
  if (grant.revoked_at !== null) throw new HttpError(409, "ALREADY_REVOKED", "Grant is already revoked");

  const revoked = await markGrantRevoked(grantId, auth.userId);
  if (!revoked) throw new HttpError(409, "ALREADY_REVOKED", "Grant is already revoked");
  await logEvent({
    eventType: "OPERATOR_ACCESS_REVOKED",
    homeId: grant.home_id,
    actorUserId: auth.userId,
    message: `${auth.username} thu hồi quyền truy cập nhà "${grant.home_name}" của operator ${grant.operator_username}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { grant_id: grantId, operator_id: grant.operator_id },
  });
  const updated = await getGrantById(grantId);
  if (!updated) throw notFound("Grant not found");
  return updated;
}
