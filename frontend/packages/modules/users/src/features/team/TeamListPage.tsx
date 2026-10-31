"use client";

import { useState } from "react";
import {
  Plus, Trash2, ShieldCheck, RefreshCw, Users as UsersIcon, Shield, Wrench, Lock, Unlock, KeyRound,
} from "lucide-react";
import { useAuth, usePermissions } from "@shh/auth";
import {
  StatusBadge, EmptyState, useToast, ConfirmModal, LoadErrorBar, BTN_PRIMARY, BTN_SM, BTN_SM_DANGER, BTN_SM_SUCCESS, BTN_SM_WARNING, CARD, CARD_HEADER, MUTED_DASH, TABLE_HEAD_ROW, TH, TR,
} from "@shh/ui";
import { formatDate, formatDateTime, formatRelative } from "@shh/utils";
import type { StaffAccount } from "@shh/api-client/dashboard";
import { useTeam } from "../../api/useTeam";
import CreateOperatorModal from "./CreateOperatorModal";
import ResetPasswordModal from "./ResetPasswordModal";

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  operator: "Vận hành",
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-brand-soft text-brand ring-1 ring-brand/30",
  operator: "bg-gray-100 dark:bg-slate-700 text-info ring-1 ring-gray-200 dark:ring-slate-600",
};

const AVATAR_BG: Record<string, string> = {
  admin: "bg-brand",
  operator: "bg-gray-500",
};

const SELF_OR_ADMIN_HINT =
  "Không thể khoá, đổi mật khẩu hoặc xoá chính bạn hay tài khoản Admin khác.";

type PendingAction =
  | { type: "lock" | "unlock" | "delete" | "reset"; account: StaffAccount }
  | { type: "create" }
  | null;

function Avatar({ username, role }: { username: string; role: string }) {
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${AVATAR_BG[role] ?? "bg-gray-500"} text-xs font-bold uppercase text-white`}>
      {username[0]}
    </div>
  );
}

export default function TeamListPage() {
  const { user: currentUser } = useAuth();
  const { canManageTeam } = usePermissions();
  const { showToast } = useToast();
  const { members, isLoading, isValidating, error, refresh, createOperator, setStatus, resetPassword, remove } = useTeam();
  const [action, setAction] = useState<PendingAction>(null);

  if (!canManageTeam) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-critical/60" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Không có quyền truy cập</h2>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">Chỉ Admin mới quản lý được tài khoản nhân viên.</p>
        </div>
      </div>
    );
  }

  const adminCount = members.filter((u) => u.role === "admin").length;
  const operatorCount = members.filter((u) => u.role === "operator").length;
  const lockedCount = members.filter((u) => u.status === "locked").length;

  const stats = [
    { label: "Tổng tài khoản", value: members.length, icon: <UsersIcon size={15} />, bg: "bg-brand-soft", text: "text-brand" },
    { label: "Quản trị viên", value: adminCount, icon: <Shield size={15} />, bg: "bg-brand-soft", text: "text-brand" },
    { label: "Vận hành", value: operatorCount, icon: <Wrench size={15} />, bg: "bg-gray-100 dark:bg-slate-700", text: "text-info" },
    { label: "Đang bị khoá", value: lockedCount, icon: <Lock size={15} />, bg: "bg-critical-soft", text: "text-critical" },
  ];

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Team & Roles</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            Quản lý tài khoản nhân viên nội bộ: tạo Operator, khoá/mở khoá, đặt lại mật khẩu, xoá.
          </p>
        </div>
        <button type="button" onClick={() => setAction({ type: "create" })} className={BTN_PRIMARY}>
          <Plus className="h-3.5 w-3.5" />
          Thêm Operator
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5">
            <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded ${s.bg} ${s.text}`}>{s.icon}</div>
            <p className="text-xl font-semibold text-gray-900 dark:text-slate-100">{s.value}</p>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className={`overflow-hidden ${CARD}`}>
        <div className={CARD_HEADER}>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">{members.length} thành viên</p>
            {(isLoading || (isValidating && members.length === 0)) && (
              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                <RefreshCw className="h-3 w-3 animate-spin" /> Đang tải…
              </span>
            )}
          </div>
        </div>

        {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

        {!error && members.length === 0 && !isLoading ? (
          <EmptyState icon={UsersIcon} title="Chưa có tài khoản nào" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW}>
                  <th className={TH}>Thành viên</th>
                  <th className={TH}>Vai trò</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={TH}>Ngày tạo</th>
                  <th className={TH}>Đăng nhập gần nhất</th>
                  <th className={TH}>Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {members.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const manageable = u.role !== "admin" && !isSelf;
                  return (
                    <tr key={u.id} className={TR}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar username={u.username} role={u.role} />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{u.username}</p>
                              {isSelf && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">Bạn</span>}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-slate-500">ID #{u.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE[u.role] ?? ""}`}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={u.status === "locked" ? "blocked" : "active"} label={u.status === "locked" ? "Đã khoá" : "Hoạt động"} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                        {u.last_login
                          ? <span title={formatDateTime(u.last_login)}>{formatRelative(u.last_login)}</span>
                          : <span className={MUTED_DASH}>Chưa đăng nhập</span>}
                      </td>
                      <td className="px-4 py-3">
                        {manageable ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {u.status === "locked" ? (
                              <button type="button" onClick={() => setAction({ type: "unlock", account: u })} className={BTN_SM_SUCCESS}>
                                <Unlock className="h-3 w-3" /> Mở khoá
                              </button>
                            ) : (
                              <button type="button" onClick={() => setAction({ type: "lock", account: u })} className={BTN_SM_WARNING}>
                                <Lock className="h-3 w-3" /> Khoá
                              </button>
                            )}
                            <button type="button" onClick={() => setAction({ type: "reset", account: u })} className={BTN_SM}>
                              <KeyRound className="h-3 w-3" /> Đặt lại mật khẩu
                            </button>
                            <button type="button" onClick={() => setAction({ type: "delete", account: u })} className={BTN_SM_DANGER}>
                              <Trash2 className="h-3 w-3" /> Xoá
                            </button>
                          </div>
                        ) : (
                          <span title={SELF_OR_ADMIN_HINT} className="text-xs text-gray-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {action?.type === "create" && (
        <CreateOperatorModal
          onClose={() => setAction(null)}
          onCreate={async (input) => {
            await createOperator(input);
            showToast(`Đã tạo tài khoản Operator “${input.username}”.`);
          }}
        />
      )}

      {action?.type === "reset" && (
        <ResetPasswordModal
          username={action.account.username}
          onClose={() => setAction(null)}
          onReset={async (password) => {
            await resetPassword(action.account, password);
            showToast(`Đã đặt lại mật khẩu cho “${action.account.username}”.`);
          }}
        />
      )}

      {(action?.type === "lock" || action?.type === "unlock") && (
        <ConfirmModal
          title={action.type === "lock" ? "Khoá tài khoản" : "Mở khoá tài khoản"}
          subtitle={action.account.username}
          icon={action.type === "lock" ? Lock : Unlock}
          danger={action.type === "lock"}
          description={action.type === "lock"
            ? `Khoá “${action.account.username}”? Tài khoản không đăng nhập được cho tới khi mở khoá; phiên đang mở bị vô hiệu ở lần gọi API kế tiếp.`
            : `Mở khoá “${action.account.username}”? Tài khoản đăng nhập lại được bình thường.`}
          confirmLabel={action.type === "lock" ? "Khoá" : "Mở khoá"}
          onConfirm={async () => {
            await setStatus(action.account, action.type === "lock" ? "locked" : "active");
            showToast(action.type === "lock" ? `Đã khoá “${action.account.username}”.` : `Đã mở khoá “${action.account.username}”.`);
          }}
          onClose={() => setAction(null)}
          errorOverrides={{ FORBIDDEN: SELF_OR_ADMIN_HINT }}
        />
      )}

      {action?.type === "delete" && (
        <ConfirmModal
          title="Xoá tài khoản"
          subtitle={action.account.username}
          icon={Trash2}
          danger
          description={`Xoá vĩnh viễn tài khoản “${action.account.username}”? Lịch sử thao tác của tài khoản trong Log vẫn được giữ lại.`}
          confirmLabel="Xoá"
          onConfirm={async () => {
            await remove(action.account);
            showToast(`Đã xoá tài khoản “${action.account.username}”.`);
          }}
          onClose={() => setAction(null)}
          errorOverrides={{ FORBIDDEN: SELF_OR_ADMIN_HINT }}
        />
      )}
    </div>
  );
}
