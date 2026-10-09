"use client";

import { api } from "@smarthome/shared/api/http";
import { PORTAL_API, useApi } from "@/lib/api/client";
import type {
  Invitation, InviteMemberInput, MyHome, PortalMember, UpdateMemberInput,
} from "@/lib/api/types";

export const membersKey = (homeId: number) => `${PORTAL_API}/homes/${homeId}/members`;
export const invitationsKey = `${PORTAL_API}/invitations`;

/** GET /homes/:id/members — kèm lời mời đang chờ nếu tôi là OWNER. */
export function useMembers(homeId: number | null) {
  return useApi<PortalMember[]>(homeId === null ? null : membersKey(homeId), { revalidateOnFocus: true });
}

/** GET /invitations — lời mời gửi tới email của tôi, còn hạn. */
export function useMyInvitations() {
  return useApi<Invitation[]>(invitationsKey, { revalidateOnFocus: true, refreshInterval: 60_000 });
}

/** POST /homes/:id/members/invite (OWNER). GUEST cần expires_at ≤ 30 ngày + device_ids. */
export function inviteMember(homeId: number, input: InviteMemberInput) {
  return api<PortalMember>(`${membersKey(homeId)}/invite`, { method: "POST", body: input });
}

/** PATCH /members/:id (OWNER, đối tượng không phải OWNER). */
export function updateMember(memberId: number, input: UpdateMemberInput) {
  return api<PortalMember>(`${PORTAL_API}/members/${memberId}`, { method: "PATCH", body: input });
}

/** DELETE /members/:id — xoá thành viên hoặc huỷ lời mời đang chờ. */
export function removeMember(memberId: number) {
  return api<void>(`${PORTAL_API}/members/${memberId}`, { method: "DELETE" });
}

/** POST /homes/:id/leave — OWNER nhận 403 OWNER_CANNOT_LEAVE. */
export function leaveHome(homeId: number) {
  return api<void>(`${PORTAL_API}/homes/${homeId}/leave`, { method: "POST" });
}

/** POST /invitations/:id/accept → nhà vừa tham gia. */
export function acceptInvitation(invitationId: number) {
  return api<MyHome>(`${invitationsKey}/${invitationId}/accept`, { method: "POST" });
}

/** POST /invitations/:id/decline */
export function declineInvitation(invitationId: number) {
  return api<void>(`${invitationsKey}/${invitationId}/decline`, { method: "POST" });
}
