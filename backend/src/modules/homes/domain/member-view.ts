// Dựng PortalMember (thành viên/lời mời dưới góc nhìn khách) — dùng chung bởi list-members, invite-member và
// update-member nên nằm ở domain/. Email chỉ lộ cho OWNER (FR-6.x quyền riêng tư).
import { toIso } from "../../../infrastructure/database/db";
import { notFound } from "../../../shared/errors/http-error";
import type { AuthContext } from "../../../core/auth/auth-context";
import type { MemberListRow, PortalMember } from "./member.types";
import { listHomeMembers } from "../infrastructure/members.read-model";
import { listGuestDeviceMap } from "../infrastructure/members.repository";

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

export async function buildMembers(auth: AuthContext, rows: MemberListRow[], viewerIsOwner: boolean): Promise<PortalMember[]> {
  const guestIds = rows.filter((row) => row.member_role === "GUEST").map((row) => row.id);
  const guestDevices = await listGuestDeviceMap(guestIds);
  return rows.map((row) => toPortalMember(row, auth, viewerIsOwner, guestDevices));
}

/** Một thành viên dưới góc nhìn OWNER (kết quả của invite / update-member). */
export async function ownerView(auth: AuthContext, homeId: number, memberId: number): Promise<PortalMember> {
  const rows = await listHomeMembers(homeId, memberId);
  const [member] = await buildMembers(auth, rows, true);
  if (!member) throw notFound("Member not found");
  return member;
}
