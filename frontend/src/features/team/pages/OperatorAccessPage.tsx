"use client";

import { useState } from "react";
import { KeyRound, Plus, Ban } from "lucide-react";
import { useOperatorAccess } from "@/features/team/hooks/useOperatorAccess";
import { useToast } from "@/shared/ui/Toast";
import StatusBadge from "@/shared/ui/StatusBadge";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import EmptyState from "@/shared/ui/EmptyState";
import { staffStore, smartHomeStore } from "@/shared/mock/store";

const DURATIONS = [
  { label: "2 giờ", hours: 2 },
  { label: "8 giờ", hours: 8 },
  { label: "24 giờ", hours: 24 },
  { label: "3 ngày", hours: 72 },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function OperatorAccessPage() {
  const { rows, isLoading, grant, revoke } = useOperatorAccess();
  const { showToast } = useToast();

  const operators = staffStore.list().filter((s) => s.role === "operator");
  const homes = smartHomeStore.list();

  const [operatorId, setOperatorId] = useState(operators[0]?.id ?? 0);
  const [homeId, setHomeId] = useState(homes[0]?.id ?? 0);
  const [reason, setReason] = useState("");
  const [durationHours, setDurationHours] = useState(DURATIONS[0].hours);
  const [revokeTarget, setRevokeTarget] = useState<number | null>(null);

  async function handleGrant() {
    if (!operatorId || !homeId || !reason.trim()) {
      showToast("Vui lòng chọn Operator, Smart Home và nhập lý do.", false);
      return;
    }
    const operator = operators.find((o) => o.id === operatorId);
    await grant({
      operator_id: operatorId,
      operator_username: operator?.username ?? "",
      home_id: homeId,
      reason: reason.trim(),
      durationHours,
    });
    setReason("");
    showToast("Đã cấp quyền truy cập.");
  }

  async function handleRevokeConfirm() {
    if (revokeTarget === null) return;
    await revoke(revokeTarget);
    setRevokeTarget(null);
    showToast("Đã thu hồi quyền truy cập.");
  }

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Operator Access</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Cấp quyền hỗ trợ có thời hạn cho Operator trên một Smart Home cụ thể.</p>
      </div>

      <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Cấp quyền mới</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Operator</label>
            <select value={operatorId} onChange={(e) => setOperatorId(Number(e.target.value))}
              className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100">
              {operators.map((o) => <option key={o.id} value={o.id}>{o.username}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Smart Home</label>
            <select value={homeId} onChange={(e) => setHomeId(Number(e.target.value))}
              className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100">
              {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Thời hạn</label>
            <select value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))}
              className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100">
              {DURATIONS.map((d) => <option key={d.hours} value={d.hours}>{d.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={handleGrant}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded bg-brand text-sm font-semibold text-white transition hover:brightness-90">
              <Plus className="h-3.5 w-3.5" /> Cấp quyền
            </button>
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Lý do (bắt buộc)</label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Gateway mất kết nối, cần kiểm tra RSSI"
            className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Danh sách quyền truy cập</p>
        </div>
        {!isLoading && rows.length === 0 ? (
          <EmptyState icon={KeyRound} title="Chưa có quyền truy cập nào được cấp" />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {rows.map(({ grant: g, homeName, isActive }) => (
              <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                    {g.operator_username} → {homeName}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{g.reason}</p>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">
                    Cấp lúc {formatDateTime(g.granted_at)} · Hết hạn {formatDateTime(g.expires_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {g.revoked_at
                    ? <StatusBadge status="blocked" label="Đã thu hồi" />
                    : isActive
                    ? <StatusBadge status="active" label="Đang hiệu lực" />
                    : <StatusBadge status="inactive" label="Đã hết hạn" />
                  }
                  {!g.revoked_at && isActive && (
                    <button type="button" onClick={() => setRevokeTarget(g.id)}
                      className="inline-flex items-center gap-1 rounded border border-critical/20 bg-critical-soft px-2.5 py-1 text-xs font-medium text-critical transition hover:brightness-95">
                      <Ban className="h-3 w-3" /> Thu hồi
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Thu hồi quyền truy cập"
        description="Operator sẽ mất quyền truy cập vào Smart Home này ngay lập tức."
        confirmLabel="Thu hồi"
        danger
        onConfirm={handleRevokeConfirm}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
