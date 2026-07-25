"use client";

import { useState } from "react";
import {
  Plus, Trash2, ShieldCheck, RefreshCw,
  Users as UsersIcon, Shield, Wrench, X,
} from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useTeam } from "@/features/team/hooks/useTeam";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import EmptyState from "@/shared/ui/EmptyState";
import type { StaffAccount } from "@/shared/mock/types";

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  operator: "Vận hành",
};

const ROLE_BADGE: Record<string, string> = {
  admin:    "bg-brand-soft text-brand ring-1 ring-brand/30",
  operator: "bg-gray-100 dark:bg-slate-700 text-info ring-1 ring-gray-200 dark:ring-slate-600",
};

const AVATAR_BG: Record<string, string> = {
  admin:    "bg-brand",
  operator: "bg-gray-500",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Avatar({ username, role }: { username: string; role: string }) {
  const bg = AVATAR_BG[role] ?? "bg-gray-500";
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg} text-xs font-bold uppercase text-white`}>
      {username[0]}
    </div>
  );
}

function CreateMemberModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (username: string, password: string, role: "admin" | "operator") => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  if (!open) return null;

  function reset() {
    setUsername(""); setPassword(""); setRole("operator");
    setError(""); setLoading(false);
  }

  function handleClose() { reset(); onClose(); }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) { setError("Vui lòng điền đầy đủ thông tin."); return; }
    if (username.length < 3)    { setError("Tên đăng nhập tối thiểu 3 ký tự."); return; }
    if (password.length < 6)    { setError("Mật khẩu tối thiểu 6 ký tự."); return; }
    setLoading(true);
    try {
      await onCreate(username, password, role);
      reset(); onClose();
    } catch {
      setError("Tên đăng nhập đã tồn tại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-brand-soft">
              <UsersIcon className="h-3.5 w-3.5 text-brand" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Thêm thành viên</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">Tạo tài khoản nhân viên nội bộ mới</p>
            </div>
          </div>
          <button type="button" onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-3 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Tên đăng nhập</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="VD: operator04"
                className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Mật khẩu</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Ít nhất 6 ký tự"
                className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Vai trò</label>
              <div className="grid grid-cols-2 gap-2">
                {(["operator", "admin"] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    className={`rounded border-2 px-3 py-2 text-sm font-medium transition
                      ${role === r ? "border-brand bg-brand-soft text-brand" : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-500"}`}>
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded border border-critical/20 bg-critical-soft px-3 py-2 text-sm text-critical">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-slate-700 px-5 py-3">
            <button type="button" onClick={handleClose}
              className="h-9 rounded border border-gray-200 dark:border-slate-600 px-4 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition">
              Huỷ
            </button>
            <button type="submit" disabled={loading}
              className="flex h-9 items-center gap-1.5 rounded bg-brand px-4 text-sm font-semibold text-white hover:brightness-90 transition disabled:opacity-60">
              {loading
                ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />Đang tạo…</>
                : <><Plus size={14} />Tạo tài khoản</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamListPage() {
  const { user: currentUser } = useAuth();
  const { members, isLoading, isError, createMember, deleteMember } = useTeam();
  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [createOpen, setCreateOpen]     = useState(false);

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-critical/60" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Không có quyền truy cập</h2>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">Chỉ admin mới có thể xem trang này.</p>
        </div>
      </div>
    );
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try { await deleteMember(deleteTarget.id); }
    finally { setActionLoading(false); setDeleteTarget(null); }
  };

  const adminCount    = members.filter((u) => u.role === "admin").length;
  const operatorCount = members.filter((u) => u.role === "operator").length;

  return (
    <div className="w-full space-y-3">

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Team & Roles</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Quản lý tài khoản nhân viên nội bộ (Admin/Operator).</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm thành viên
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Tổng tài khoản", value: members.length, icon: <UsersIcon size={15} />, bg: "bg-brand-soft",   text: "text-brand" },
          { label: "Quản trị viên",  value: adminCount,     icon: <Shield size={15} />,     bg: "bg-brand-soft",   text: "text-brand" },
          { label: "Vận hành",       value: operatorCount,  icon: <Wrench size={15} />,     bg: "bg-gray-100 dark:bg-slate-700", text: "text-info" },
        ].map((s) => (
          <div key={s.label} className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5">
            <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded ${s.bg} ${s.text}`}>
              {s.icon}
            </div>
            <p className="text-xl font-semibold text-gray-900 dark:text-slate-100">{s.value}</p>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">{members.length} thành viên</p>
            {isLoading && (
              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                <RefreshCw className="h-3 w-3 animate-spin" /> Đang tải…
              </span>
            )}
            {isError && <span className="text-xs text-critical">Lỗi kết nối</span>}
          </div>
        </div>

        {!isError && members.length === 0 && !isLoading ? (
          <EmptyState icon={UsersIcon} title="Chưa có tài khoản nào" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thành viên</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Vai trò</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Ngày tạo</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hoạt động gần nhất</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {members.map((u) => (
                  <tr key={u.id} className="bg-white dark:bg-slate-800 transition-colors hover:bg-brand-soft/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar username={u.username} role={u.role} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{u.username}</p>
                            {u.id === currentUser?.id && (
                              <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">Bạn</span>
                            )}
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
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{formatDate(u.last_login)}</td>
                    <td className="px-4 py-3">
                      {u.role !== "admin" && u.id !== currentUser?.id && (
                        <button type="button" onClick={() => setDeleteTarget(u)}
                          className="inline-flex items-center gap-1 rounded border border-critical/20 bg-critical-soft px-2.5 py-1 text-xs font-medium text-critical transition hover:brightness-95">
                          <Trash2 className="h-3 w-3" />
                          Xoá
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateMemberModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(username, password, role) => createMember(username, password, role)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Xoá tài khoản"
        description={`Bạn chắc chắn muốn xoá tài khoản "${deleteTarget?.username}"?`}
        confirmLabel={actionLoading ? "Đang xoá…" : "Xoá"}
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => !actionLoading && setDeleteTarget(null)}
      />
    </div>
  );
}
