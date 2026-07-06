"use client";

import { useState } from "react";
import {
  Plus, Trash2, KeyRound, ShieldCheck, RefreshCw,
  Users as UsersIcon, Shield, Wrench, X, Lock,
} from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useUsers } from "@/features/users/hooks/useUsers";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import type { ApiUser } from "@/shared/types/api";

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  operator: "Vận hành",
};

const ROLE_BADGE: Record<string, string> = {
  admin:    "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  operator: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
};

const ROLE_DOT: Record<string, string> = {
  admin:    "bg-blue-500",
  operator: "bg-violet-500",
};

const AVATAR_BG: Record<string, string> = {
  admin:    "bg-blue-600",
  operator: "bg-violet-600",
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

function PasswordModal({ user, onClose, onSave }: {
  user: ApiUser;
  onClose: () => void;
  onSave: (pw: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Mật khẩu tối thiểu 6 ký tự."); return; }
    if (password !== confirm)  { setError("Mật khẩu xác nhận không khớp."); return; }
    setLoading(true);
    try { await onSave(password); onClose(); }
    catch { setError("Lỗi khi đổi mật khẩu. Thử lại."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-50">
              <Lock className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Đổi mật khẩu</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">{user.username}</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700">
            <X size={14} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Mật khẩu mới</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
              placeholder="Ít nhất 6 ký tự"
              className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Xác nhận mật khẩu</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Nhập lại mật khẩu"
              className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 rounded border border-gray-200 dark:border-slate-600 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition">
              Huỷ
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-9 rounded bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">
              {loading ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateUserModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  if (!open) return null;

  function reset() {
    setUsername(""); setPassword("");
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
      await onCreate(username, password);
      reset(); onClose();
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(code === "USERNAME_TAKEN" ? "Tên đăng nhập đã tồn tại." : "Tạo tài khoản thất bại. Thử lại.");
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
            <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-50">
              <UsersIcon className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Thêm thành viên</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">Tạo tài khoản truy cập mới</p>
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
                placeholder="VD: operator01"
                className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Mật khẩu</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Ít nhất 6 ký tự"
                className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
            </div>

            {error && (
              <p className="rounded border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
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
              className="flex h-9 items-center gap-1.5 rounded bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">
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

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { users, isLoading, isError, createUser, changePassword, deleteUser } = useUsers();
  const [pwTarget, setPwTarget]         = useState<ApiUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [createOpen, setCreateOpen]     = useState(false);

  // Bảo vệ phía client: trùng với requireRole("admin") của backend nhưng ngăn
  // user không phải admin thấy trang trắng/lỗi khi điều hướng trực tiếp vào đây.
  if (currentUser?.role !== "admin") {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Không có quyền truy cập</h2>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">Chỉ admin mới có thể xem trang này.</p>
        </div>
      </div>
    );
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try { await deleteUser(deleteTarget.id); }
    finally { setActionLoading(false); setDeleteTarget(null); }
  };

  const adminCount    = users.filter((u) => u.role === "admin").length;
  const operatorCount = users.filter((u) => u.role === "operator").length;

  return (
    <div className="w-full space-y-3">

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Quản lý thành viên</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Tạo, phân quyền và quản lý tài khoản hệ thống.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm thành viên
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Tổng tài khoản", value: users.length,   icon: <UsersIcon size={15} />, bg: "bg-blue-50",   text: "text-blue-600" },
          { label: "Quản trị viên",  value: adminCount,     icon: <Shield size={15} />,    bg: "bg-blue-50",   text: "text-blue-600" },
          { label: "Vận hành",       value: operatorCount,  icon: <Wrench size={15} />,    bg: "bg-violet-50", text: "text-violet-600" },
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

      {/* Table */}
      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">{users.length} thành viên</p>
            {isLoading && (
              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                <RefreshCw className="h-3 w-3 animate-spin" /> Đang tải…
              </span>
            )}
            {isError && <span className="text-xs text-red-500">Lỗi kết nối</span>}
          </div>
        </div>

        {!isError && users.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <UsersIcon className="mb-3 h-9 w-9 text-gray-200 dark:text-slate-700" />
            <p className="text-sm font-medium text-gray-400 dark:text-slate-500">Chưa có tài khoản nào</p>
            <button onClick={() => setCreateOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition">
              <Plus size={12} /> Thêm thành viên đầu tiên
            </button>
          </div>
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
                {users.map((u) => (
                  <tr key={u.id} className="bg-white dark:bg-slate-800 transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar username={u.username} role={u.role} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{u.username}</p>
                            {u.id === currentUser?.id && (
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 ring-1 ring-blue-200">
                                Bạn
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 dark:text-slate-500">ID #{u.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE[u.role] ?? ""}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[u.role] ?? "bg-gray-400"}`} />
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{formatDate(u.last_login)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setPwTarget(u)}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:border-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-300">
                          <KeyRound className="h-3 w-3" />
                          Mật khẩu
                        </button>
                        {u.role !== "admin" && u.id !== currentUser?.id && (
                          <button type="button" onClick={() => setDeleteTarget(u)}
                            className="inline-flex items-center gap-1 rounded border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:border-red-200 hover:bg-red-100">
                            <Trash2 className="h-3 w-3" />
                            Xoá
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createUser} />

      {pwTarget && (
        <PasswordModal
          user={pwTarget}
          onClose={() => setPwTarget(null)}
          onSave={(pw) => changePassword(pwTarget.id, pw)}
        />
      )}

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
