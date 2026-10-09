"use client";

import { useState } from "react";
import { KeyRound, RefreshCw, Search, UserCircle } from "lucide-react";
import ModalShell from "@smarthome/console/components/ModalShell";
import { InlineError } from "@smarthome/console/components/PageStates";
import { useDashboardSWR } from "@smarthome/console/api/client";
import { customersKey } from "@smarthome/console/api/customers.api";
import { assignOwner } from "@smarthome/console/api/smartHomes.api";
import { errorMessage } from "@smarthome/console/lib/errors";
import { useDebouncedValue } from "@smarthome/console/lib/hooks";
import { BTN_PRIMARY, BTN_SECONDARY, LABEL } from "@smarthome/console/lib/ui";
import type { Customer, SmartHomeDetailHome } from "@smarthome/console/api/types";

type AssignOwnerModalProps = {
  open: boolean;
  homeId: number;
  homeName: string;
  /** Gợi ý ô tìm kiếm (VD tên chủ dự kiến nhập lúc tạo nhà). */
  initialQuery?: string;
  onClose: () => void;
  onAssigned: (customer: Customer, home: SmartHomeDetailHome) => void;
};

// Operator tra cứu khách hàng (GET /customers?q= — tên, user_tag, email, SĐT)
// rồi gán quyền sở hữu (POST /smart-homes/:id/assign-owner { user_tag }) — luồng
// bổ sung cho việc khách tự quét QR. Backend xử lý như một lượt claim trong 1
// transaction, thu hồi mã chưa dùng và ghi activation_logs (operator_assign).
// Nên render có điều kiện (`{open && <AssignOwnerModal …/>}`) để mỗi lần mở là trạng thái mới.
export default function AssignOwnerModal({
  open, homeId, homeName, initialQuery = "", onClose, onAssigned,
}: AssignOwnerModalProps) {
  const [search, setSearch] = useState(initialQuery);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const query = useDebouncedValue(search.trim(), 300);
  const { data: results, error: searchError, isLoading } = useDashboardSWR<Customer[]>(
    open && query.length >= 2 ? customersKey(query) : null,
    { keepPreviousData: true }
  );

  async function handleConfirm() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const home = await assignOwner(homeId, selected.user_tag);
      onAssigned(selected, home);
      onClose();
    } catch (err) {
      setError(errorMessage(err, {
        ALREADY_CLAIMED: "Nhà này vừa được kích hoạt (khách tự quét mã hoặc đã được gán). Đóng hộp thoại và tải lại trang để xem chủ nhà hiện tại.",
        NOT_FOUND: "Không tìm thấy Smart Home này nữa. Tải lại danh sách rồi thử lại.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  const list = results ?? [];

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Gán quyền sở hữu"
      subtitle={homeName}
      icon={KeyRound}
      busy={submitting}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="button" onClick={handleConfirm} disabled={!selected || submitting} className={BTN_PRIMARY}>
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
            onChange={(e) => { setSearch(e.target.value); setSelected(null); setError(""); }}
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
                    onClick={() => { setSelected(c); setError(""); }}
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
