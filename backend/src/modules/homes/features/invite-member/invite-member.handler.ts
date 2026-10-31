// POST /homes/:homeId/members/invite — mời thành viên (FR-6.2). Chỉ OWNER ("manage_members"); lời mời hết hạn
// sau 7 ngày; GUEST bắt buộc có expires_at (≤ 30 ngày) + thiết bị. Ghi audit + notify + bus `home_changed`.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { notifyUser } from "../../../notifications";
import { requireHomeMember } from "../../domain/access-policy";
import { validateGuestGrant } from "../../domain/guest-grant";
import { ownerView } from "../../domain/member-view";
import { ROLE_LABEL } from "../../domain/member.types";
import type { PortalMember } from "../../domain/member.types";
import { assertHomeWritable } from "../../domain/permissions";
import { emailAlreadyInHome, findUserIdByEmail } from "../../infrastructure/members.read-model";
import {
  deleteExpiredMemberRow,
  insertInvite,
  replaceGuestDevices,
} from "../../infrastructure/members.repository";
import type { InviteInput } from "./invite-member.dto";

const DAY_MS = 24 * 3600 * 1000;
const INVITE_TTL_MS = 7 * DAY_MS;

export async function inviteMember(auth: AuthContext, homeId: number, input: InviteInput, meta: RequestMeta): Promise<PortalMember> {
  const access = await requireHomeMember(auth, homeId, "manage_members");
  assertHomeWritable(access.home);
  if (auth.email !== null && auth.email.toLowerCase() === input.email) {
    throw new HttpError(400, "CANNOT_INVITE_SELF", "You cannot invite yourself");
  }
  if (input.role === "GUEST") await validateGuestGrant(homeId, input.expiresAt, input.deviceIds);
  if (await emailAlreadyInHome(homeId, input.email)) throw new HttpError(409, "ALREADY_MEMBER", "Email is already a member or has a pending invite");

  const existingUserId = await findUserIdByEmail(input.email);
  const memberId = await withTransaction(async (conn) => {
    // Dòng GUEST hết hạn của chính người này sẽ chặn unique khi họ nhận lời mời mới → dọn trước
    if (existingUserId !== null) await deleteExpiredMemberRow(conn, homeId, existingUserId);
    const id = await insertInvite(conn, {
      homeId,
      email: input.email,
      name: input.name,
      role: input.role,
      invitedBy: auth.userId,
      expiresAt: input.role === "GUEST" ? input.expiresAt : null,
      inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    if (input.role === "GUEST") await replaceGuestDevices(conn, id, input.deviceIds);
    return id;
  });

  await logEvent({
    eventType: "MEMBER_INVITED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.displayName} mời ${input.name} vào nhà "${access.home.name}" với vai trò ${ROLE_LABEL[input.role]}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { member_id: memberId, role: input.role },
  });
  if (existingUserId !== null) {
    await notifyUser({
      userId: existingUserId,
      homeId,
      type: "MEMBER_INVITED",
      title: "Lời mời vào nhà",
      message: `Bạn được mời vào nhà "${access.home.name}" với vai trò ${ROLE_LABEL[input.role]}. Mở mục Lời mời để chấp nhận.`,
      severity: "info",
    });
  }
  return ownerView(auth, homeId, memberId);
}
