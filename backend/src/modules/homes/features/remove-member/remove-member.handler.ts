// DELETE /members/:memberId — xoá thành viên / huỷ lời mời (FR-6.4). Chỉ OWNER ("manage_members");
// không xoá được OWNER. Ghi audit + notify thành viên bị xoá + bus `home_changed`.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { withTransaction } from "../../../../infrastructure/database/db";
import { forbidden, notFound } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import { logEvent } from "../../../audit";
import { notifyUser } from "../../../notifications";
import { requireHomeMember } from "../../domain/access-policy";
import { assertHomeWritable } from "../../domain/permissions";
import { getMemberRow } from "../../infrastructure/members.read-model";
import { deleteMember } from "../../infrastructure/members.repository";

export async function removeMember(auth: AuthContext, memberId: number, meta: RequestMeta): Promise<void> {
  const target = await getMemberRow(memberId);
  if (!target) throw notFound("Member not found");
  const access = await requireHomeMember(auth, target.home_id, "manage_members");
  assertHomeWritable(access.home);
  if (target.member_role === "OWNER") throw forbidden("The owner cannot be removed");

  await withTransaction((conn) => deleteMember(conn, target.id));
  const label = target.user_name ?? target.display_name ?? "thành viên";
  await logEvent({
    eventType: "MEMBER_REMOVED",
    homeId: target.home_id,
    actorUserId: auth.userId,
    message:
      target.user_id === null
        ? `${auth.displayName} huỷ lời mời ${label}`
        : `${auth.displayName} xoá ${label} khỏi nhà "${access.home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { member_id: target.id, role: target.member_role, pending: target.user_id === null },
  });
  if (target.user_id !== null) {
    await notifyUser({
      userId: target.user_id,
      homeId: null, // đã không còn là thành viên → không gắn vào nhà
      type: "MEMBER_REMOVED",
      title: "Bạn đã bị xoá khỏi nhà",
      message: `Bạn không còn quyền truy cập nhà "${access.home.name}".`,
      severity: "warning",
    });
    eventBus.emit("home_changed", { home_id: target.home_id, user_ids: [target.user_id] });
  }
  eventBus.emit("home_changed", { home_id: target.home_id });
}
