// Cấp / thu hồi quyền truy cập nhà khách của Operator (FR-9.6). Dùng cho:
//   - ADMIN cấp (POST /operator-access),
//   - Operator tự xin quyền khẩn cấp (POST /smart-homes/:id/access-requests, "break-glass").
import type { RequestMeta } from "../../../lib/clientIp";
import { withTransaction } from "../../../lib/db";
import { HttpError, forbidden, notFound, type ErrorExtraValue } from "../../../lib/http";
import { findActiveGrant } from "../../access/access.repository";
import type { AuthContext } from "../../auth/auth.types";
import { getHomeRow } from "../../homes/homes.repository";
import { logEvent } from "../../logs/logEvent";
import { notifyStaff } from "../../notifications/notification.service";
import type { OperatorAccessGrant } from "../dashboard.types";
import { requireAdmin } from "../common/staff";
import {
  countSelfServiceGrantsSince,
  findActiveOperator,
  getGrantById,
  insertGrant,
  listGrants,
  lockOperatorRow,
  markGrantRevoked,
} from "./operatorAccess.repository";

const HOUR_MS = 3600 * 1000;
/** Hạn mức "break-glass": số grant Operator tự cấp mỗi 24 giờ. */
const SELF_SERVICE_MAX_PER_DAY = 5;

export async function listOperatorGrants(auth: AuthContext): Promise<OperatorAccessGrant[]> {
  // ADMIN thấy tất cả; OPERATOR chỉ thấy grant của chính mình
  return listGrants({ operatorId: auth.role === "admin" ? undefined : auth.userId, limit: 200 });
}

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

/** Operator tự xin quyền (có hiệu lực ngay, báo ADMIN, audit mức warning). */
export async function selfServiceGrant(
  auth: AuthContext,
  input: { homeId: number; reason: string; durationHours: number },
  meta: RequestMeta
): Promise<OperatorAccessGrant> {
  if (auth.role !== "operator") throw forbidden("Only operators can request access");
  const home = await getHomeRow(input.homeId);
  if (!home) throw notFound("Home not found");

  // Khoá hàng operator → hai request song song không cùng vượt hạn mức / tạo grant trùng nhà
  const id = await withTransaction(async (conn) => {
    await lockOperatorRow(auth.userId, conn);
    const active = await findActiveGrant(auth.userId, home.id, conn);
    if (active !== null) {
      throw new HttpError(409, "ACCESS_ALREADY_ACTIVE", "An active access grant already exists for this home", {
        grant: (await getGrantById(active.id, conn)) as unknown as ErrorExtraValue,
      });
    }
    if ((await countSelfServiceGrantsSince(auth.userId, 24, conn)) >= SELF_SERVICE_MAX_PER_DAY) {
      throw new HttpError(429, "TOO_MANY_REQUESTS", `At most ${SELF_SERVICE_MAX_PER_DAY} self-service grants per 24 hours`);
    }
    return insertGrant(
      {
        operatorId: auth.userId,
        homeId: home.id,
        reason: input.reason,
        grantedBy: auth.userId,
        expiresAt: new Date(Date.now() + input.durationHours * HOUR_MS),
      },
      conn
    );
  });
  await logEvent({
    eventType: "OPERATOR_ACCESS_GRANTED",
    severity: "warning",
    homeId: home.id,
    actorUserId: auth.userId,
    message: `Operator ${auth.username} tự cấp quyền truy cập nhà "${home.name}" trong ${input.durationHours} giờ`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { grant_id: id, self_service: true, duration_hours: input.durationHours },
  });
  await notifyStaff({
    targetRole: "admin",
    type: "OPERATOR_ACCESS_GRANTED",
    title: "Operator xin quyền truy cập nhà khách",
    message: `Operator ${auth.username} đã mở quyền truy cập nhà "${home.name}" trong ${input.durationHours} giờ. Lý do: ${input.reason}`,
    severity: "warning",
    homeId: home.id,
    actor: { id: auth.userId, username: auth.username, role: auth.role },
  });
  const grant = await getGrantById(id);
  if (!grant) throw new Error("grant could not be read back");
  return grant;
}

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
