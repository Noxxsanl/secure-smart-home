"use client";

import { KeyRound, RefreshCw, Search, UserCircle } from "lucide-react";
import { ModalShell, InlineError, BTN_PRIMARY, BTN_SECONDARY, LABEL } from "@shh/ui";
import { errorMessage } from "@shh/api-client/dashboard";
import type { AssignOwnerState } from "../model/assignOwner";

type AssignOwnerModalProps = {
  homeName: string;
  /** Kết quả của `useAssignOwner` (api/). */
  state: AssignOwnerState;
  onClose: () => void;
};

// Hộp thoại "Gán quyền sở hữu" — chỉ hiển thị; tìm khách + gán chủ nằm ở api/useAssignOwner.
// Nên render có điều kiện (`{target && …}`) để mỗi lần mở là trạng thái mới.
export default function AssignOwnerModal({ homeName, state, onClose }: AssignOwnerModalProps) {
  const { search, query, results: list, searchError, isSearching: isLoading, selected, submitting, error } = state;

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Gán quyền sở hữu"
      subtitle={homeName}
      icon={KeyRound}
      busy={submitting}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="button" onClick={state.confirm} disabled={!selected || submitting} className={BTN_PRIMARY}>
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Cấp quyền sở hữu
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="assign-owner-search" className={LABEL}>Tìm khách hàng theo User ID, tên, email hoặc SĐT</label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            id="assign-owner-search"
            type="text"
            autoFocus
            value={search}
            onChange={(e) => state.changeSearch(e.target.value)}
            placeholder="VD: kimanh#1560"
            className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 pl-8 pr-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>
        <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
          User ID hiện trong mục Hồ sơ của ứng dụng khách hàng (dạng tên#1234). Nhập ít nhất 2 ký tự.
        </p>
      </div>

      {query.length >= 2 && (
        <div className="max-h-56 overflow-y-auto rounded border border-gray-100 dark:border-slate-700">
          {searchError ? (
            <p className="px-3 py-4 text-center text-sm text-critical">{errorMessage(searchError)}</p>
          ) : isLoading && list.length === 0 ? (
            <p className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-gray-400 dark:text-slate-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tìm…
            </p>
          ) : list.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-gray-400 dark:text-slate-500">
              Không tìm thấy khách hàng nào. Nhờ khách đăng ký tài khoản trên ứng dụng trước, rồi tìm lại bằng User ID.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => state.select(c)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition
                      ${selected?.id === c.id ? "bg-brand-soft" : "hover:bg-gray-50 dark:hover:bg-slate-700"}`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-600">
                      <UserCircle className="h-4 w-4 text-gray-400 dark:text-slate-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{c.name}</p>
                      <p className="truncate text-xs text-gray-400 dark:text-slate-500">
                        <span className="font-mono">{c.user_tag}</span>
                        {c.email ? ` · ${c.email}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-gray-400 dark:text-slate-500">{c.homes_count} nhà</span>
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
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-slate-100">
            {selected.name} <span className="font-mono text-xs text-gray-500 dark:text-slate-400">({selected.user_tag})</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {[selected.phone, selected.email].filter(Boolean).join(" · ") || "Chưa có thông tin liên hệ"}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
            Nhà sẽ chuyển sang <span className="font-semibold">Active</span> với khách hàng này là chủ nhà (OWNER); mã kích hoạt
            chưa dùng bị thu hồi. Thao tác được ghi vào Provision Log.
          </p>
        </div>
      )}

      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
