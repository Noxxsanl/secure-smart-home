"use client";

import { useMemo, useState } from "react";
import { Search, UserCircle, X, KeyRound } from "lucide-react";
import { customerStore } from "@/shared/mock/store";
import type { Customer } from "@/shared/mock/types";

type AssignOwnerModalProps = {
  open: boolean;
  homeName: string;
  onClose: () => void;
  onAssign: (customerId: number) => void;
};

// Operator tra cứu khách hàng theo user_tag (handle sinh ra khi khách đăng ký
// tài khoản trên Mobile App, VD "dat#4821") và gán trực tiếp quyền sở hữu cho
// Smart Home vừa tạo — thay thế/luồng bổ sung cho việc khách tự quét QR.
export default function AssignOwnerModal({ open, homeName, onClose, onAssign }: AssignOwnerModalProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return customerStore.list().filter(
      (c) => c.user_tag.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [search]);

  if (!open) return null;

  function reset() {
    setSearch(""); setSelected(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleConfirm() {
    if (!selected) return;
    onAssign(selected.id);
    reset();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-brand-soft">
              <KeyRound className="h-3.5 w-3.5 text-brand" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Gán quyền sở hữu</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{homeName}</p>
            </div>
          </div>
          <button type="button" onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Tìm khách hàng theo User ID hoặc tên</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                type="text" autoFocus
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
                placeholder="VD: kimanh#1560"
                className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 pl-8 pr-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </div>
          </div>

          {search.trim() && (
            <div className="max-h-52 overflow-y-auto rounded border border-gray-100 dark:border-slate-700">
              {results.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-gray-400 dark:text-slate-500">Không tìm thấy khách hàng nào.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(c)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition
                          ${selected?.id === c.id ? "bg-brand-soft" : "hover:bg-gray-50 dark:hover:bg-slate-700"}`}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-600">
                          <UserCircle className="h-4 w-4 text-gray-400 dark:text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{c.name}</p>
                          <p className="font-mono text-xs text-gray-400 dark:text-slate-500">{c.user_tag}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selected && (
            <div className="rounded border border-brand/30 bg-brand-soft/40 px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand">Đã chọn</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-slate-100">{selected.name} <span className="font-mono text-xs text-gray-500 dark:text-slate-400">({selected.user_tag})</span></p>
              <p className="text-xs text-gray-500 dark:text-slate-400">{selected.phone} · {selected.email}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-slate-700 px-5 py-3">
          <button type="button" onClick={handleClose}
            className="h-9 rounded border border-gray-200 dark:border-slate-600 px-4 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition">
            Huỷ
          </button>
          <button type="button" disabled={!selected} onClick={handleConfirm}
            className="flex h-9 items-center gap-1.5 rounded bg-brand px-4 text-sm font-semibold text-white hover:brightness-90 transition disabled:cursor-not-allowed disabled:opacity-50">
            Cấp quyền sở hữu
          </button>
        </div>
      </div>
    </div>
  );
}
