// PATCH /homes/:homeId — đổi tên/địa chỉ nhà (CONTRACT §4.2). Cần quyền "rename"; nhà suspended → 409.
import type { RequestMeta } from "../../../../core/http/request-meta";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError, notFound } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { logEvent } from "../../../audit";
import { requireHomeMember } from "../../domain/access-policy";
import { toHome } from "../../domain/home.mapper";
import type { Home } from "../../domain/home.types";
import { assertHomeWritable } from "../../domain/permissions";
import { getHomeRow } from "../../infrastructure/home.read-model";
import { updateHomeFields } from "../../infrastructure/customer-homes.repository";

export async function patchHome(
  auth: AuthContext,
  homeId: number,
  patch: { name?: string; address?: string | null },
  meta: RequestMeta
): Promise<Home> {
  const access = await requireHomeMember(auth, homeId, "rename");
  assertHomeWritable(access.home);
  if (patch.name === undefined && patch.address === undefined) {
    throw new HttpError(400, "MISSING_FIELDS", "name or address is required");
  }
  await withTransaction((conn) => updateHomeFields(conn, homeId, patch));
  await logEvent({
    eventType: "HOME_RENAMED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.displayName} cập nhật thông tin nhà "${patch.name ?? access.home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { fields: Object.keys(patch) },
  });
  eventBus.emit("home_changed", { home_id: homeId });
  const fresh = await getHomeRow(homeId);
  if (!fresh) throw notFound("Home not found");
  return toHome(fresh);
}
