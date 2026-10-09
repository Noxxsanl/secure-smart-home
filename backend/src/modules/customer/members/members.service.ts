// Thành viên & lời mời (FR-6.2 → 6.6). Mọi thay đổi → audit category activity + bus `home_changed`.
// Quyền: chỉ OWNER mời/đổi vai trò/xoá ("manage_members"); mọi thành viên xem được danh sách;
// email chỉ lộ cho OWNER. Lời mời hết hạn sau 7 ngày; GUEST bắt buộc có expires_at (≤ 30 ngày) + thiết bị.
import type { RequestMeta } from "../../../lib/clientIp";
import { isDuplicateKeyError, toIso, withTransaction } from "../../../lib/db";
import { eventBus } from "../../../lib/eventBus";
import { HttpError, forbidden, notFound } from "../../../lib/http";
import type { MemberRole } from "../../../types/domain";
import { assertHomeWritable } from "../../access/permissions";
import { requireHomeMember } from "../../access/access.service";
import type { AuthContext } from "../../auth/auth.types";
import { logEvent } from "../../logs/logEvent";
import { notifyHomeMembers, notifyUser } from "../../notifications/notification.service";
import type { MyHome } from "../customer.types";
import { getMyHome } from "../homes/homes.service";
import {
  activateInvite,
  deleteExpiredMemberRow,
  deleteInviteForEmail,
  deleteMember,
  emailAlreadyInHome,
  filterHomeDeviceIds,
  findUserIdByEmail,
  getMemberRow,
  hasEffectiveMembership,
  insertInvite,
  listGuestDeviceMap,
  listHomeMembers,
  listInvitationsForEmail,
  lockInviteForEmail,
  replaceGuestDevices,
  updateMemberRow,
  type MemberListRow,
} from "./members.repository";

const DAY_MS = 24 * 3600 * 1000;
const INVITE_TTL_MS = 7 * DAY_MS;
const GUEST_MAX_MS = 30 * DAY_MS;

export interface PortalMember {
  id: number;
  home_id: number;
  user_id: number | null;
  name: string;
  initials: string;
  email: string | null;
  role: MemberRole;
  is_me: boolean;
  pending: boolean;
  invite_expires_at: string | null;
  expires_at: string | null;
  guest_device_ids: number[];
  joined_at: string | null;
}

export interface InvitationView {
  id: number;
  home: { id: number; name: string; address: string | null };
  role: MemberRole;
  invited_by_name: string | null;
  invite_expires_at: string;
  expires_at: string | null;
}

const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: "Chủ nhà",
  CONTROLLER: "Người điều khiển",
  VIEWER: "Người xem",
  GUEST: "Khách",
};

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return "?";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

function toPortalMember(row: MemberListRow, auth: AuthContext, viewerIsOwner: boolean, guestDevices: Map<number, number[]>): PortalMember {
  const pending = row.user_id === null;
  const name = (pending ? row.display_name : (row.user_name ?? row.display_name)) ?? row.invite_email ?? "Thành viên";
  return {
    id: row.id,
    home_id: row.home_id,
    user_id: row.user_id,
    name,
    initials: initialsOf(name),
    // Email chỉ lộ cho OWNER (FR-6.x quyền riêng tư)
    email: viewerIsOwner ? (pending ? row.invite_email : row.user_email) : null,
    role: row.member_role,
    is_me: row.user_id !== null && row.user_id === auth.userId,
    pending,
    invite_expires_at: pending ? toIso(row.invite_expires_at) : null,
    expires_at: toIso(row.expires_at),
    guest_device_ids: guestDevices.get(row.id) ?? [],
    joined_at: pending ? null : toIso(row.accepted_at ?? row.created_at),
  };
}

async function buildMembers(auth: AuthContext, rows: MemberListRow[], viewerIsOwner: boolean): Promise<PortalMember[]> {
  const guestIds = rows.filter((row) => row.member_role === "GUEST").map((row) => row.id);
  const guestDevices = await listGuestDeviceMap(guestIds);
  return rows.map((row) => toPortalMember(row, auth, viewerIsOwner, guestDevices));
}

export async function listMembers(auth: AuthContext, homeId: number): Promise<PortalMember[]> {
  const access = await requireHomeMember(auth, homeId, "view");
  const isOwner = access.role === "OWNER";
  const rows = await listHomeMembers(homeId);
  // Lời mời đang chờ chỉ OWNER thấy
  const visible = isOwner ? rows : rows.filter((row) => row.user_id !== null);
  return buildMembers(auth, visible, isOwner);
}

async function ownerView(auth: AuthContext, homeId: number, memberId: number): Promise<PortalMember> {
  const rows = await listHomeMembers(homeId, memberId);
  const [member] = await buildMembers(auth, rows, true);
  if (!member) throw notFound("Member not found");
  return member;
}

// ── Validate GUEST ─────────────────────────────────────────────────────────

async function validateGuestGrant(homeId: number, expiresAt: Date | null, deviceIds: number[]): Promise<void> {
  const now = Date.now();
  if (expiresAt === null) throw new HttpError(400, "INVALID_INPUT", "expires_at is required for GUEST");
  if (expiresAt.getTime() <= now) throw new HttpError(400, "INVALID_INPUT", "expires_at must be in the future");
  if (expiresAt.getTime() > now + GUEST_MAX_MS) throw new HttpError(400, "INVALID_INPUT", "expires_at must be within 30 days");
  if (deviceIds.length === 0) throw new HttpError(400, "INVALID_INPUT", "device_ids must not be empty for GUEST");
  const valid = await filterHomeDeviceIds(homeId, deviceIds);
  if (valid.length !== deviceIds.length) throw new HttpError(400, "INVALID_INPUT", "device_ids must belong to this home");
}

// ── Mời / sửa / xoá ────────────────────────────────────────────────────────

export interface InviteInput {
  email: string;
  name: string;
  role: Exclude<MemberRole, "OWNER">;
  expiresAt: Date | null;
  deviceIds: number[];
}

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

export interface PatchMemberInput {
  role?: Exclude<MemberRole, "OWNER">;
  /** undefined = không đổi; null = xoá hạn (chỉ hợp lệ khi vai trò kết quả không phải GUEST). */
  expiresAt?: Date | null;
  deviceIds?: number[];
}

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

// ── Lời mời của tôi ────────────────────────────────────────────────────────

export async function listMyInvitations(auth: AuthContext): Promise<InvitationView[]> {
  if (auth.email === null) return [];
  const rows = await listInvitationsForEmail(auth.email.toLowerCase());
  return rows.map((row) => ({
    id: row.id,
    home: { id: row.home_id, name: row.home_name, address: row.home_address },
    role: row.member_role,
    invited_by_name: row.invited_by_name,
    invite_expires_at: toIso(row.invite_expires_at) ?? "",
    expires_at: toIso(row.expires_at),
  }));
}

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
