// POST /smart-homes/:id/access-requests — Operator tự xin quyền khẩn cấp vào nhà khách ("break-glass", FR-9.6):
// có hiệu lực ngay, báo ADMIN, audit mức warning; hạn mức SELF_SERVICE_MAX_PER_DAY grant / 24 giờ.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError, forbidden, notFound, type ErrorExtraValue } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { notifyStaff } from "../../../notifications";
import type { OperatorAccessGrant } from "../../domain/console-home.types";
import { findActiveGrant } from "../../infrastructure/access.repository";
import { getHomeRow } from "../../infrastructure/home.read-model";
import { getGrantById, lockOperatorRow } from "../../infrastructure/operator-access.read-model";
import { countSelfServiceGrantsSince, insertGrant } from "../../infrastructure/operator-access.repository";

const HOUR_MS = 3600 * 1000;
/** Hạn mức "break-glass": số grant Operator tự cấp mỗi 24 giờ. */
const SELF_SERVICE_MAX_PER_DAY = 5;

/** Operator tự xin quyền (có hiệu lực ngay, báo ADMIN, audit mức warning). */
export async function requestHomeAccess(
  auth: AuthContext,
  homeId: number,
  input: { reason: string; durationHours: number },
  meta: RequestMeta
): Promise<OperatorAccessGrant> {
  if (auth.role !== "operator") throw forbidden("Only operators can request access");
  const home = await getHomeRow(homeId);
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
