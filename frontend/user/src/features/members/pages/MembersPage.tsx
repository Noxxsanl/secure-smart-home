"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Mail, Pencil, Trash2, Users } from "lucide-react";
import ConfirmDialog from "@smarthome/shared/ui/ConfirmDialog";
import EmptyState from "@smarthome/shared/ui/EmptyState";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import { useToast } from "@smarthome/shared/ui/Toast";
import { errorStatus, exactly, useRevalidate } from "@/lib/api/client";
import { homesKey, overviewKey, useHomeOverview } from "@/lib/api/homes";
import { inviteMember, leaveHome, membersKey, removeMember, updateMember, useMembers } from "@/lib/api/members";
import { notificationsPrefix } from "@/lib/api/notifications";
import type { InviteMemberInput, MyHome, PortalMember, UpdateMemberInput } from "@/lib/api/types";
import { portalErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { MEMBER_ROLE_LABELS, permissionsFor, ROLE_HINTS } from "@/lib/roles";
import ErrorPanel from "@/widgets/ErrorPanel";
import HomeGate from "@/features/home/components/HomeGate";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import EditMemberDialog from "@/features/members/components/EditMemberDialog";
import InviteMemberForm from "@/features/members/components/InviteMemberForm";
import MyInvitations from "@/features/members/components/MyInvitations";

// Thông điệp riêng cho các lỗi của luồng mời / sửa thành viên (CONTRACT §4.2).
const MEMBER_ERRORS: Record<string, string> = {
  INVALID_INPUT:
    "Thông tin chưa hợp lệ. Kiểm tra email; với vai trò Khách cần chọn hạn truy cập tối đa 30 ngày và ít nhất một thiết bị của nhà.",
  FORBIDDEN: "Chỉ chủ nhà (Owner) mới quản lý được thành viên.",
  NOT_FOUND: "Thành viên hoặc lời mời này không còn tồn tại. Danh sách sẽ được làm mới.",
};

// OWNER trước, thành viên đang hoạt động, rồi lời mời đang chờ.
function rank(m: PortalMember): number {
  if (m.role === "OWNER") return 0;
  return m.pending ? 2 : 1;
}

function memberSubtitle(m: PortalMember, deviceNames: Map<number, string>): React.ReactNode {
  if (m.pending) {
    return (
      <span className="inline-flex items-center gap-1">
        <Mail className="h-3 w-3" /> Chờ chấp nhận · lời mời hết hạn {formatDate(m.invite_expires_at)}
      </span>
    );
  }
  if (m.role === "GUEST") {
    // Chỉ OWNER thấy danh sách thiết bị được cấp; người khác có thể nhận mảng rỗng.
    const ids = m.guest_device_ids ?? [];
    const names = ids.map((id) => deviceNames.get(id)).filter((n): n is string => Boolean(n));
    const devices = m.guest_device_ids ? ` · ${ids.length} thiết bị${names.length > 0 ? `: ${names.join(", ")}` : ""}` : "";
    return `Quyền khách đến ${formatDate(m.expires_at)}${devices}`;
  }
  return ROLE_HINTS[m.role];
}

function Members({ myHome }: { myHome: MyHome }) {
  const router = useRouter();
  const { refresh } = useCurrentHome();
  const { showToast } = useToast();
  const revalidate = useRevalidate();
  const homeId = myHome.home.id;
  const perms = permissionsFor(myHome.role);
  const { data: members, error, mutate } = useMembers(homeId);
  // Danh sách thiết bị để chọn / hiện tên thiết bị của Khách — dùng chung cache với Tổng quan, không polling riêng.
  const { data: overview } = useHomeOverview(homeId, 0);
  const [toEdit, setToEdit] = useState<PortalMember | null>(null);
  const [toRemove, setToRemove] = useState<PortalMember | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const devices = (overview?.devices ?? []).filter((d) => d.category !== "gateway");
  const deviceNames = new Map(devices.map((d) => [d.id, d.device_name]));

  /** Chạy một thao tác ghi rồi làm mới danh sách; trả về thông điệp lỗi hoặc null khi thành công. */
  async function run(action: () => Promise<unknown>, success: string): Promise<string | null> {
    try {
      await action();
      await revalidate(membersKey(homeId), overviewKey(homeId), exactly(homesKey), notificationsPrefix);
      showToast(success);
      return null;
    } catch (err) {
      // 404 / 409 thường do danh sách đã cũ (lời mời hết hạn, người đó đã rời nhà) — tải lại cho khớp.
      const status = errorStatus(err);
      if (status === 404 || status === 409) void mutate();
      return portalErrorMessage(err, MEMBER_ERRORS);
    }
  }

  const invite = (input: InviteMemberInput) =>
    run(() => inviteMember(homeId, input), `Đã gửi lời mời tới ${input.email}. Lời mời có hiệu lực 7 ngày.`);

  async function save(member: PortalMember, input: UpdateMemberInput) {
    const failure = await run(() => updateMember(member.id, input), `Đã cập nhật quyền của ${member.name}.`);
    if (!failure) setToEdit(null);
    return failure;
  }

  async function remove(member: PortalMember) {
    const failure = await run(
      () => removeMember(member.id),
      member.pending ? `Đã huỷ lời mời gửi tới ${member.name}.` : `Đã xoá ${member.name} khỏi nhà.`,
    );
    if (failure) showToast(failure, false);
  }

  async function leave() {
    try {
      await leaveHome(homeId);
    } catch (err) {
      showToast(portalErrorMessage(err), false); // VD OWNER_CANNOT_LEAVE
      return;
    }
    showToast("Bạn đã rời khỏi nhà.");
    // Tải lại danh sách nhà: nhà vừa rời biến mất, "nhà đang chọn" tự chuyển sang nhà khác (hoặc màn hình chưa có nhà).
    await refresh();
    router.push("/home");
  }

  const sorted = [...(members ?? [])].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="w-full space-y-4">
      <MyInvitations />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Thành viên</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {perms.canManageMembers
              ? "Bạn là chủ nhà — có thể mời, đổi vai trò hoặc xoá thành viên."
              : `Bạn là ${MEMBER_ROLE_LABELS[myHome.role].toLowerCase()} của ${myHome.home.name}. Chỉ chủ nhà mới quản lý được thành viên.`}
          </p>
        </div>
        {perms.canLeave && (
          <button
            type="button" onClick={() => setConfirmLeave(true)}
            className="inline-flex items-center gap-1.5 rounded border border-critical/40 px-3.5 py-1.5 text-sm font-semibold text-critical transition hover:bg-critical-soft"
          >
            <LogOut className="h-4 w-4" /> Rời khỏi nhà
          </button>
        )}
      </div>

      {perms.canManageMembers && <InviteMemberForm devices={devices} onInvite={invite} />}

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        {!members ? (
          error ? (
            <div className="p-4"><ErrorPanel error={error} onRetry={() => mutate()} /></div>
          ) : (
            <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          )
        ) : sorted.length === 0 ? (
          <EmptyState icon={Users} title="Chưa có thành viên" />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {sorted.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                  {m.initials}
                </div>
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {m.name}
                    {m.is_me && <span className="ml-1.5 text-xs font-medium text-gray-400">(Bạn)</span>}
                  </p>
                  {m.email && <p className="text-xs text-gray-500 dark:text-slate-400">{m.email}</p>}
                  <p className="text-xs text-gray-400 dark:text-slate-500">{memberSubtitle(m, deviceNames)}</p>
                </div>

                <span className="rounded bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-slate-300">
                  {MEMBER_ROLE_LABELS[m.role]}
                </span>

                {perms.canManageMembers && m.role !== "OWNER" && (
                  <div className="flex gap-1">
                    {!m.pending && (
                      <button
                        type="button" onClick={() => setToEdit(m)} aria-label={`Sửa quyền của ${m.name}`} title="Sửa vai trò / quyền"
                        className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button" onClick={() => setToRemove(m)}
                      aria-label={m.pending ? `Huỷ lời mời gửi tới ${m.name}` : `Xoá ${m.name} khỏi nhà`}
                      title={m.pending ? "Huỷ lời mời" : "Xoá khỏi nhà"}
                      className="rounded p-1.5 text-gray-400 transition hover:bg-critical-soft hover:text-critical"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {toEdit && (
        <EditMemberDialog
          key={toEdit.id}
          member={toEdit}
          devices={devices}
          onClose={() => setToEdit(null)}
          onSave={(input) => save(toEdit, input)}
        />
      )}

      <ConfirmDialog
        open={!!toRemove}
        title={toRemove?.pending ? "Huỷ lời mời" : "Xoá thành viên"}
        description={
          toRemove?.pending
            ? `Lời mời gửi tới ${toRemove.name} sẽ bị huỷ — họ không thể tham gia bằng lời mời này nữa.`
            : `${toRemove?.name ?? ""} sẽ mất quyền truy cập nhà này ngay lập tức.`
        }
        confirmLabel={toRemove?.pending ? "Huỷ lời mời" : "Xoá"}
        cancelLabel="Giữ lại"
        danger
        onConfirm={() => {
          const member = toRemove;
          setToRemove(null);
          if (member) void remove(member);
        }}
        onCancel={() => setToRemove(null)}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Rời khỏi nhà"
        description={`Bạn sẽ không còn xem hay điều khiển được ${myHome.home.name}. Muốn quay lại cần chủ nhà mời lại.`}
        confirmLabel="Rời khỏi nhà"
        cancelLabel="Ở lại"
        danger
        onConfirm={() => {
          setConfirmLeave(false);
          void leave();
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}

export default function MembersPage() {
  return <HomeGate>{(home) => <Members myHome={home} />}</HomeGate>;
}
