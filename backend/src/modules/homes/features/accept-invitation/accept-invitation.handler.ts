// POST /invitations/:id/accept — chấp nhận lời mời (FR-6.6). Khoá lời mời FOR UPDATE trong transaction để hai
// lần bấm song song không tạo hai dòng thành viên; trả MyHome vừa tham gia.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { isDuplicateKeyError, withTransaction } from "../../../../infrastructure/database/db";
import { HttpError, notFound } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import { logEvent } from "../../../audit";
import { notifyHomeMembers } from "../../../notifications";
import { ROLE_LABEL } from "../../domain/member.types";
import { getMyHome } from "../../domain/my-homes";
import type { MyHome } from "../../domain/my-home.types";
import {
  activateInvite,
  deleteExpiredMemberRow,
  hasEffectiveMembership,
  lockInviteForEmail,
} from "../../infrastructure/members.repository";

export async function acceptInvitation(auth: AuthContext, inviteId: number, meta: RequestMeta): Promise<MyHome> {
  if (auth.email === null) throw notFound("Invitation not found");
  const email = auth.email.toLowerCase();
  let homeId: number;
  try {
    homeId = await withTransaction(async (conn) => {
      const invite = await lockInviteForEmail(conn, inviteId, email);
      if (!invite) throw notFound("Invitation not found");
      if (await hasEffectiveMembership(conn, invite.home_id, auth.userId)) {
        throw new HttpError(409, "ALREADY_MEMBER", "You are already a member of this home");
      }
      await deleteExpiredMemberRow(conn, invite.home_id, auth.userId);
      await activateInvite(conn, invite.id, auth.userId);
      return invite.home_id;
    });
  } catch (err) {
    // Unique (home_id, user_id): đã có dòng thành viên khác của người này
    if (isDuplicateKeyError(err)) throw new HttpError(409, "ALREADY_MEMBER", "You are already a member of this home");
    throw err;
  }

  const mine = await getMyHome(auth.userId, homeId);
  await logEvent({
    eventType: "MEMBER_JOINED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.displayName} đã tham gia nhà "${mine.home.name}" với vai trò ${ROLE_LABEL[mine.role]}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { role: mine.role },
  });
  await notifyHomeMembers({
    homeId,
    roles: ["OWNER"],
    excludeUserId: auth.userId,
    type: "MEMBER_JOINED",
    title: "Thành viên mới",
    // Kèm email tài khoản để chủ nhà nhận ra nếu người chấp nhận không phải người mình định mời
    message: `${auth.displayName} (${email}) đã chấp nhận lời mời vào nhà "${mine.home.name}" (${ROLE_LABEL[mine.role]}).`,
    severity: "info",
  });
  eventBus.emit("home_changed", { home_id: homeId });
  return mine;
}
