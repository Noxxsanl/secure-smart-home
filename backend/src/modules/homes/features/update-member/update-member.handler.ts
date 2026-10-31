// PATCH /members/:memberId — đổi vai trò / hạn / thiết bị GUEST (FR-6.3). Chỉ OWNER ("manage_members");
// không sửa được OWNER. Ghi audit + notify thành viên + bus `home_changed`.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError, forbidden, notFound } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import type { MemberRole } from "../../../../shared/types/domain";
import { logEvent } from "../../../audit";
import { notifyUser } from "../../../notifications";
import { requireHomeMember } from "../../domain/access-policy";
import { validateGuestGrant } from "../../domain/guest-grant";
import { ownerView } from "../../domain/member-view";
import { ROLE_LABEL } from "../../domain/member.types";
import type { PortalMember } from "../../domain/member.types";
import { assertHomeWritable } from "../../domain/permissions";
import { filterHomeDeviceIds, getMemberRow } from "../../infrastructure/members.read-model";
import { listGuestDeviceMap, replaceGuestDevices, updateMemberRow } from "../../infrastructure/members.repository";
import type { PatchMemberInput } from "./update-member.dto";

export async function patchMember(auth: AuthContext, memberId: number, input: PatchMemberInput, meta: RequestMeta): Promise<PortalMember> {
  const target = await getMemberRow(memberId);
  if (!target) throw notFound("Member not found");
  const access = await requireHomeMember(auth, target.home_id, "manage_members");
  assertHomeWritable(access.home);
  if (target.member_role === "OWNER") throw forbidden("The owner cannot be modified");
  if (input.role === undefined && input.expiresAt === undefined && input.deviceIds === undefined) {
    throw new HttpError(400, "MISSING_FIELDS", "role, expires_at or device_ids is required");
  }

  const newRole: MemberRole = input.role ?? target.member_role;
  let expiresAt: Date | null = null;
  let deviceIds: number[] | null = null; // null = không đụng member_device_access
  if (newRole === "GUEST") {
    const currentDevices = (await listGuestDeviceMap([target.id])).get(target.id) ?? [];
    expiresAt = input.expiresAt !== undefined ? input.expiresAt : target.expires_at;
    const effectiveDevices = input.deviceIds ?? currentDevices;
    // Cấp lại quyền GUEST: hạn mới phải ở tương lai; không đổi hạn thì giữ hạn cũ (đã kiểm khi tạo)
    if (input.expiresAt !== undefined || input.role !== undefined) {
      await validateGuestGrant(target.home_id, expiresAt, effectiveDevices);
    } else if (input.deviceIds !== undefined) {
      if (input.deviceIds.length === 0) throw new HttpError(400, "INVALID_INPUT", "device_ids must not be empty for GUEST");
      if ((await filterHomeDeviceIds(target.home_id, input.deviceIds)).length !== input.deviceIds.length) {
        throw new HttpError(400, "INVALID_INPUT", "device_ids must belong to this home");
      }
    }
    if (input.deviceIds !== undefined || target.member_role !== "GUEST") deviceIds = effectiveDevices;
  } else {
    if (input.expiresAt !== undefined && input.expiresAt !== null) {
      throw new HttpError(400, "INVALID_INPUT", "expires_at is only valid for GUEST");
    }
    if (target.member_role === "GUEST") deviceIds = []; // GUEST → vai trò khác: bỏ danh sách thiết bị riêng
  }

  await withTransaction(async (conn) => {
    await updateMemberRow(conn, target.id, newRole, expiresAt);
    if (deviceIds !== null) await replaceGuestDevices(conn, target.id, deviceIds);
  });

  const roleChanged = newRole !== target.member_role;
  await logEvent({
    eventType: "MEMBER_ROLE_CHANGED",
    homeId: target.home_id,
    actorUserId: auth.userId,
    message: roleChanged
      ? `${auth.displayName} đổi vai trò của ${target.user_name ?? target.display_name ?? "thành viên"} thành ${ROLE_LABEL[newRole]}`
      : `${auth.displayName} cập nhật quyền truy cập của ${target.user_name ?? target.display_name ?? "thành viên"}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { member_id: target.id, from: target.member_role, to: newRole },
  });
  if (target.user_id !== null) {
    await notifyUser({
      userId: target.user_id,
      homeId: target.home_id,
      type: "MEMBER_ROLE_CHANGED",
      title: "Quyền truy cập đã thay đổi",
      message: `Quyền của bạn trong nhà "${access.home.name}" hiện là ${ROLE_LABEL[newRole]}.`,
      severity: "info",
    });
  }
  eventBus.emit("home_changed", { home_id: target.home_id });
  return ownerView(auth, target.home_id, target.id);
}
