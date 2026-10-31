"use client";

import { useState } from "react";
import { Check, Mail, X } from "lucide-react";
import { useToast } from "@shh/ui";
import { useRevalidate, notificationsPrefix, portalErrorMessage } from "@shh/api-client/portal";
import { acceptInvitation, declineInvitation, invitationsKey, useMyInvitations } from "../../api/members.api";
import type { Invitation } from "@shh/api-client/portal";
import { formatDate } from "@shh/utils";
import { MEMBER_ROLE_LABELS, useCurrentHome } from "@shh/auth";

const INVITATION_ERRORS: Record<string, string> = {
  NOT_FOUND: "Lời mời không còn hiệu lực (đã hết hạn hoặc bị chủ nhà huỷ).",
  ALREADY_MEMBER: "Bạn đã là thành viên của nhà này.",
};

// "Lời mời của tôi" (FR-6.2): lời mời gửi tới email của tài khoản, còn hạn.
// Hiện ở trang Thành viên và ở màn hình "chưa có nhà" — tài khoản mới chỉ có
// lời mời thì chưa có nhà nào để vào trang Thành viên.
export default function MyInvitations() {
  const { data: invitations } = useMyInvitations();
  const { refresh, selectHome } = useCurrentHome();
  const { showToast } = useToast();
  const revalidate = useRevalidate();
  const [busyId, setBusyId] = useState<number | null>(null);

  if (!invitations || invitations.length === 0) return null;

  async function accept(invitation: Invitation) {
    setBusyId(invitation.id);
    try {
      const joined = await acceptInvitation(invitation.id);
      await refresh();
      selectHome(joined.home.id);
      showToast(`Bạn đã tham gia ${joined.home.name} với vai trò ${MEMBER_ROLE_LABELS[joined.role]}.`);
    } catch (err) {
      showToast(portalErrorMessage(err, INVITATION_ERRORS), false);
    } finally {
      setBusyId(null);
      void revalidate(invitationsKey, notificationsPrefix);
    }
  }

  async function decline(invitation: Invitation) {
    setBusyId(invitation.id);
    try {
      await declineInvitation(invitation.id);
      showToast(`Đã từ chối lời mời vào ${invitation.home.name}.`);
    } catch (err) {
      showToast(portalErrorMessage(err, INVITATION_ERRORS), false);
    } finally {
      setBusyId(null);
      void revalidate(invitationsKey, notificationsPrefix);
    }
  }

  return (
    <section className="rounded-md border border-brand/30 bg-white dark:bg-slate-800">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-slate-700">
        <Mail className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Lời mời của tôi ({invitations.length})</h2>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-slate-700">
        {invitations.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-56 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{inv.home.name}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {inv.invited_by_name ? `${inv.invited_by_name} mời bạn` : "Bạn được mời"} với vai trò{" "}
                <span className="font-semibold">{MEMBER_ROLE_LABELS[inv.role]}</span>
                {inv.home.address ? ` · ${inv.home.address}` : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">
                Lời mời hết hạn {formatDate(inv.invite_expires_at)}
                {inv.role === "GUEST" && inv.expires_at ? ` · quyền khách đến ${formatDate(inv.expires_at)}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === inv.id}
                onClick={() => accept(inv)}
                className="inline-flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-90 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> Chấp nhận
              </button>
              <button
                type="button"
                disabled={busyId === inv.id}
                onClick={() => decline(inv)}
                className="inline-flex items-center gap-1 rounded border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <X className="h-3.5 w-3.5" /> Từ chối
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
