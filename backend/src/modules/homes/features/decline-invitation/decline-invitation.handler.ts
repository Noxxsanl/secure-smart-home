// POST /invitations/:id/decline — từ chối lời mời (FR-6.6): xoá dòng lời mời của đúng email, báo OWNER.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { notFound } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import { logEvent } from "../../../audit";
import { notifyHomeMembers } from "../../../notifications";
import { deleteInviteForEmail } from "../../infrastructure/members.repository";

export async function declineInvitation(auth: AuthContext, inviteId: number, meta: RequestMeta): Promise<void> {
  if (auth.email === null) throw notFound("Invitation not found");
  const removed = await deleteInviteForEmail(inviteId, auth.email.toLowerCase());
  if (!removed) throw notFound("Invitation not found");
  await logEvent({
    eventType: "INVITE_DECLINED",
    homeId: removed.home_id,
    actorUserId: auth.userId,
    message: `${auth.displayName} từ chối lời mời vào nhà`,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  await notifyHomeMembers({
    homeId: removed.home_id,
    roles: ["OWNER"],
    type: "INVITE_DECLINED",
    title: "Lời mời bị từ chối",
    message: `${auth.displayName} đã từ chối lời mời vào nhà.`,
    severity: "info",
  });
  eventBus.emit("home_changed", { home_id: removed.home_id });
}
