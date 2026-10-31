// POST /operator-access — ADMIN cấp quyền truy cập nhà khách cho một Operator (FR-9.6).
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import { HttpError } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import type { OperatorAccessGrant } from "../../domain/console-home.types";
import { getHomeRow } from "../../infrastructure/home.read-model";
import { findActiveOperator, getGrantById } from "../../infrastructure/operator-access.read-model";
import { insertGrant } from "../../infrastructure/operator-access.repository";

const HOUR_MS = 3600 * 1000;

/** ADMIN cấp quyền cho một Operator. */
export async function grantAsAdmin(
  auth: AuthContext,
  input: { operatorId: number; homeId: number; reason: string; durationHours: number },
  meta: RequestMeta
): Promise<OperatorAccessGrant> {
  requireAdmin(auth);
  const operator = await findActiveOperator(input.operatorId);
  if (!operator) throw new HttpError(404, "OPERATOR_NOT_FOUND", "Operator not found or locked");
  const home = await getHomeRow(input.homeId);
  if (!home) throw new HttpError(404, "HOME_NOT_FOUND", "Home not found");

  const id = await insertGrant({
    operatorId: operator.id,
    homeId: home.id,
    reason: input.reason,
    grantedBy: auth.userId,
    expiresAt: new Date(Date.now() + input.durationHours * HOUR_MS),
  });
  await logEvent({
    eventType: "OPERATOR_ACCESS_GRANTED",
    homeId: home.id,
    actorUserId: auth.userId,
    message: `${auth.username} cấp quyền truy cập nhà "${home.name}" cho operator ${operator.username ?? operator.id} trong ${input.durationHours} giờ`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { grant_id: id, operator_id: operator.id, duration_hours: input.durationHours },
  });
  const grant = await getGrantById(id);
  if (!grant) throw new Error("grant could not be read back");
  return grant;
}
