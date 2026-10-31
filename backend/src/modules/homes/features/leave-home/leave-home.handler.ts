// POST /homes/:homeId/leave — thành viên tự rời nhà (FR-6.5). OWNER không được rời (403 OWNER_CANNOT_LEAVE).
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import { logEvent } from "../../../audit";
import { notifyHomeMembers } from "../../../notifications";
import { requireHomeMember } from "../../domain/access-policy";
import { deleteMember } from "../../infrastructure/members.repository";

export async function leaveHome(auth: AuthContext, homeId: number, meta: RequestMeta): Promise<void> {
  const access = await requireHomeMember(auth, homeId);
  if (access.role === "OWNER") throw new HttpError(403, "OWNER_CANNOT_LEAVE", "The owner cannot leave the home");
  await withTransaction((conn) => deleteMember(conn, access.member.id));
  await logEvent({
    eventType: "MEMBER_LEFT",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.displayName} đã rời nhà "${access.home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { role: access.role },
  });
  await notifyHomeMembers({
    homeId,
    roles: ["OWNER"],
    type: "MEMBER_LEFT",
    title: "Thành viên đã rời nhà",
    message: `${auth.displayName} đã rời nhà "${access.home.name}".`,
    severity: "info",
  });
  eventBus.emit("home_changed", { home_id: homeId, user_ids: [auth.userId] });
  eventBus.emit("home_changed", { home_id: homeId });
}
