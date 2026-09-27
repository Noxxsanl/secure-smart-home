"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Mail, Trash2, UserPlus, Users } from "lucide-react";
import ConfirmDialog from "@smarthome/shared/ui/ConfirmDialog";
import EmptyState from "@smarthome/shared/ui/EmptyState";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import { useToast } from "@smarthome/shared/ui/Toast";
import {
  changeMemberRole, inviteMember, leaveHome, listMembers, MEMBER_ROLE_LABELS, removeMember,
  type PortalMember,
} from "@smarthome/shared/mock/portal";
import type { MemberRole } from "@smarthome/shared/mock/types";
import HomeGate from "@/features/home/components/HomeGate";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import { useHomeQuery, useRevalidatePortal } from "@/lib/portal-swr";
import { portalErrorMessage } from "@/lib/errors";

type AssignableRole = Exclude<MemberRole, "OWNER">;
const ASSIGNABLE: AssignableRole[] = ["CONTROLLER", "VIEWER", "GUEST"];

// PRD §3.2 — hiển thị để khách hiểu mỗi vai trò làm được gì trước khi mời.
const ROLE_HINTS: Record<MemberRole, string> = {
  OWNER: "Toàn quyền: điều khiển, tự động hoá, quản lý thành viên.",
  CONTROLLER: "Điều khiển thiết bị, tạo quy tắc tự động hoá.",
  VIEWER: "Chỉ xem trạng thái thiết bị và cảm biến.",
  GUEST: "Truy cập có thời hạn, chỉ thiết bị được chỉ định.",
};

const fieldClass =
  "h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

function InviteForm({ onInvite }: { onInvite: (input: { name: string; email: string; role: AssignableRole }) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("CONTROLLER");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const ok = await onInvite({ name, email, role });
    setSubmitting(false);
    if (ok) { setName(""); setEmail(""); setRole("CONTROLLER"); }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Mời thành viên</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên hiển thị" className={fieldClass} aria-label="Tên hiển thị" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email người được mời" className={fieldClass} aria-label="Email" />
        <select value={role} onChange={(e) => setRole(e.target.value as AssignableRole)} className={fieldClass} aria-label="Vai trò">
          {ASSIGNABLE.map((r) => <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>)}
        </select>
        <button type="submit" disabled={submitting} className="h-9 rounded bg-brand px-4 text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50">
          {submitting ? "Đang gửi…" : "Gửi lời mời"}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">{ROLE_HINTS[role]} Lời mời hết hạn sau 7 ngày.</p>
    </form>
  );
}

function Members() {
  const router = useRouter();
  const { customerId, current, permissions, refreshHomes } = useCurrentHome();
  const { showToast } = useToast();
  const revalidate = useRevalidatePortal();
  const { data: members, isLoading } = useHomeQuery("members", listMembers);
  const [toRemove, setToRemove] = useState<PortalMember | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const homeId = current?.home.id ?? 0;
  const canManage = !!permissions?.canManageMembers;

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      await revalidate();
      showToast(success);
      return true;
    } catch (err) {
      showToast(portalErrorMessage(err), false);
      return false;
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Thành viên</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {canManage ? "Bạn là chủ nhà — có thể mời, đổi vai trò hoặc xoá thành viên." : "Chỉ chủ nhà mới quản lý được thành viên."}
          </p>
        </div>
        {!canManage && (
          <button
            type="button" onClick={() => setConfirmLeave(true)}
            className="inline-flex items-center gap-1.5 rounded border border-critical/40 px-3.5 py-1.5 text-sm font-semibold text-critical transition hover:bg-critical-soft"
          >
            <LogOut className="h-4 w-4" /> Rời khỏi nhà
          </button>
        )}
      </div>

      {canManage && (
        <InviteForm onInvite={(input) => run(() => inviteMember(customerId, homeId, input), `Đã gửi lời mời tới ${input.email}.`)} />
      )}

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        {isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : !members || members.length === 0 ? (
          <EmptyState icon={Users} title="Chưa có thành viên" />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                  {m.initials}
                </div>
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {m.name}{m.is_me && <span className="ml-1.5 text-xs font-medium text-gray-400">(Bạn)</span>}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">
                    {m.pending && m.invite_expires_at
                      ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> Chờ chấp nhận · hết hạn {new Date(m.invite_expires_at).toLocaleDateString("vi-VN")}</span>
                      : ROLE_HINTS[m.role]}
                  </p>
                </div>

                {canManage && m.role !== "OWNER" ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => run(() => changeMemberRole(customerId, m.id, e.target.value as AssignableRole), `Đã đổi vai trò của ${m.name}.`)}
                      className="h-8 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 text-xs font-medium text-gray-700 dark:text-slate-200"
                      aria-label={`Vai trò của ${m.name}`}
                    >
                      {ASSIGNABLE.map((r) => <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>)}
                    </select>
                    <button
                      type="button" onClick={() => setToRemove(m)} aria-label={`Xoá ${m.name}`}
                      className="rounded p-1.5 text-gray-400 transition hover:bg-critical-soft hover:text-critical"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <span className="rounded bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-slate-300">
                    {MEMBER_ROLE_LABELS[m.role]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!toRemove}
        title="Xoá thành viên"
        description={`${toRemove?.name ?? ""} sẽ mất quyền truy cập nhà này ngay lập tức.`}
        confirmLabel="Xoá"
        cancelLabel="Huỷ"
        danger
        onConfirm={() => {
          const m = toRemove;
          setToRemove(null);
          if (m) run(() => removeMember(customerId, m.id), `Đã xoá ${m.name} khỏi nhà.`);
        }}
        onCancel={() => setToRemove(null)}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Rời khỏi nhà"
        description={`Bạn sẽ không còn xem hay điều khiển được ${current?.home.name ?? "nhà này"}. Muốn quay lại cần chủ nhà mời lại.`}
        confirmLabel="Rời khỏi nhà"
        cancelLabel="Huỷ"
        danger
        onConfirm={async () => {
          setConfirmLeave(false);
          const ok = await run(() => leaveHome(customerId, homeId), "Bạn đã rời khỏi nhà.");
          if (ok) { await refreshHomes(); router.push("/home"); }
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}

export default function MembersPage() {
  return <HomeGate>{() => <Members />}</HomeGate>;
}
