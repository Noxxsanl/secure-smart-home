"use client";

import { useState, useMemo } from "react";
import {
  RefreshCw, Search, X, Trash2, XCircle, CheckCircle,
  ShieldAlert, ChevronLeft, ChevronRight, Filter, Cpu, Server,
} from "lucide-react";
import { useAuditLog, type AuditLogFilters } from "@/features/audit/hooks/useAuditLog";
import { usePermissions } from "@/features/auth/hooks/usePermissions";
import AuditLogTable from "@/features/audit/components/AuditLogTable";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import api from "@/shared/api/client";
import { FetchError } from "@/shared/api/errors";

// Bản sao frontend của ALLOWED_EVENT_TYPES_BY_ROLE từ backend/src/routes/audit.ts.
// Dùng để hiển thị dropdown event-type chỉ với các loại role hiện tại có thể thấy.
// Backend vẫn thực thi các giới hạn này; đây chỉ là UX (không hiện option bị cấm).
const EVENT_TYPES_BY_ROLE: Record<string, string[]> = {
  admin: [
    "GATEWAY_AUTH_FAIL", "SENSOR_AUTH_FAIL", "REPLAY_ATTACK", "PRIVILEGE_ESCALATION",
    "DATA_RECV", "DEVICE_REGISTER", "DEVICE_BLOCKED", "DEVICE_STATUS_CHANGE", "DEVICE_DELETE",
  ],
  operator: [
    "GATEWAY_AUTH_FAIL", "SENSOR_AUTH_FAIL", "REPLAY_ATTACK", "PRIVILEGE_ESCALATION",
    "DATA_RECV", "DEVICE_REGISTER", "DEVICE_BLOCKED", "DEVICE_STATUS_CHANGE",
  ],
};

const PAGE_SIZES = [10, 25, 50, 100];

type Toast = { msg: string; ok: boolean } | null;
type ConfirmAction = "selected" | "byType" | null;

export default function AuditPage() {
  const { canDeleteAuditLog, isAdmin } = usePermissions();
  const role = isAdmin ? "admin" : "operator";
  const EVENT_TYPES = EVENT_TYPES_BY_ROLE[role] ?? EVENT_TYPES_BY_ROLE.operator;

  const [eventType, setEventType]   = useState("");
  const [deviceId, setDeviceId]     = useState("");
  const [fromDate, setFromDate]     = useState("");
  const [toDate, setToDate]         = useState("");
  const [deviceType, setDeviceType] = useState<"" | "sensor" | "gateway">("");
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(25);
  const [cleanType, setCleanType]   = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toast, setToast]           = useState<Toast>(null);
  const [showFilters, setShowFilters] = useState(true);

  const filters: AuditLogFilters = useMemo(
    () => ({
      event_type: eventType || undefined,
      device_id: deviceId || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    }),
    [eventType, deviceId, fromDate, toDate],
  );

  const { logs: rawLogs, isLoading, isError, refresh } = useAuditLog(filters);

  const logs = useMemo(() => {
    if (!deviceType) return rawLogs;
    // API không hỗ trợ lọc theo device_type nên lọc phía client
    // dựa trên quy ước đặt tên device_id: "ESP32-SN-XXXX" cho sensor và
    // "ESP32-GW-XXXX" cho gateway (được đặt lúc đăng ký trong devices.ts).
    const marker = deviceType === "sensor" ? "-SN-" : "-GW-";
    return rawLogs.filter((l) => l.device_identifier?.includes(marker) ?? false);
  }, [rawLogs, deviceType]);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageLogs   = logs.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = !!(eventType || deviceId || fromDate || toDate || deviceType);
  const activeFilterCount = [eventType, deviceId, fromDate, toDate, deviceType].filter(Boolean).length;

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function clearFilters() {
    setEventType(""); setDeviceId(""); setFromDate(""); setToDate("");
    setDeviceType(""); setPage(1);
  }

  function handleToggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleToggleAll(ids: number[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) { ids.forEach((id) => next.delete(id)); }
      else             { ids.forEach((id) => next.add(id)); }
      return next;
    });
  }

  async function execDeleteSelected() {
    setIsDeleting(true);
    const count = selectedIds.size;
    try {
      await api.delete("/api/audit-log/bulk", { ids: Array.from(selectedIds) });
      setSelectedIds(new Set());
      refresh();
      showToast(`Đã xóa ${count} log.`);
    } catch (err: unknown) {
      if (err instanceof FetchError && err.status === 403)
        showToast("Không có quyền truy cập.", false);
      else
        showToast("Xóa thất bại. Vui lòng thử lại.", false);
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  }

  async function execCleanByType() {
    if (!cleanType) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/audit-log/by-type?event_type=${cleanType}`);
      refresh();
      showToast(`Đã dọn toàn bộ log ${cleanType}.`);
      setCleanType("");
    } catch (err: unknown) {
      if (err instanceof FetchError && err.status === 403)
        showToast("Không có quyền truy cập.", false);
      else
        showToast("Xóa thất bại. Vui lòng thử lại.", false);
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  }

  function buildPageNumbers(): (number | "…")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "…")[] = [1];
    if (safePage > 3) pages.push("…");
    for (let p = Math.max(2, safePage - 1); p <= Math.min(totalPages - 1, safePage + 1); p++)
      pages.push(p);
    if (safePage < totalPages - 2) pages.push("…");
    pages.push(totalPages);
    return pages;
  }

  return (
    <div className="w-full space-y-3">

      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Audit Log</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            Nhật ký bảo mật và sự kiện hệ thống.
            {!isLoading && !isError && (
              <span className="ml-1.5 font-medium text-gray-700 dark:text-slate-300">{logs.length} sự kiện{hasFilters ? " (đã lọc)" : ""}.</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium transition
              ${showFilters
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700"}`}
          >
            <Filter className="h-3.5 w-3.5" />
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => refresh()}
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-400 transition hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Filter card */}
      {showFilters && (
        <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Bộ lọc</p>
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Event Type</label>
              <select
                value={eventType}
                onChange={(e) => { setEventType(e.target.value); setPage(1); }}
                className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              >
                <option value="">Tất cả loại</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Device ID</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  type="number" min={1} placeholder="VD: 3"
                  value={deviceId}
                  onChange={(e) => { setDeviceId(e.target.value); setPage(1); }}
                  className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 py-2 pl-8 pr-3 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Từ ngày</label>
              <input
                type="datetime-local" value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Đến ngày</label>
              <input
                type="datetime-local" value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-slate-700 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-slate-400">Loại thiết bị:</span>
              <div className="flex items-center gap-1">
                {(
                  [
                    { value: "",        label: "Tất cả",  icon: null },
                    { value: "gateway", label: "Gateway", icon: <Server  size={12} /> },
                    { value: "sensor",  label: "Sensor",  icon: <Cpu     size={12} /> },
                  ] as const
                ).map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setDeviceType(value); setPage(1); }}
                    className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition
                      ${deviceType === value
                        ? value === "gateway"
                          ? "bg-blue-600 text-white"
                          : value === "sensor"
                          ? "bg-violet-600 text-white"
                          : "bg-gray-800 dark:bg-slate-100 text-white dark:text-slate-900"
                        : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600"
                      }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="ml-auto inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-slate-400 transition hover:bg-gray-200 dark:hover:bg-slate-600"
                >
                  <X size={11} /> Xoá bộ lọc
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin Actions bar */}
      {isAdmin && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Admin Actions</span>
              {selectedIds.size > 0 && (
                <span className="rounded bg-amber-200 dark:bg-amber-800/50 px-2 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                  {selectedIds.size} đã chọn
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setConfirmAction("selected")}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa {selectedIds.size} đã chọn
                </button>
              )}

              {selectedIds.size > 0 && (
                <div className="h-4 w-px bg-amber-300 dark:bg-amber-700" />
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Dọn theo loại:</span>
                <select
                  value={cleanType}
                  onChange={(e) => setCleanType(e.target.value)}
                  className="h-8 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 px-2.5 text-sm text-gray-800 dark:text-slate-200 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="">-- Chọn loại --</option>
                  {EVENT_TYPES_BY_ROLE.admin.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  onClick={() => cleanType && setConfirmAction("byType")}
                  disabled={!cleanType || isDeleting}
                  className="inline-flex items-center gap-1.5 rounded border border-amber-400 dark:border-amber-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300 transition hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isDeleting ? "Đang xóa…" : "Dọn"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
          <div className="flex items-center gap-3">
            {isError ? (
              <span className="text-sm text-red-500">Không có quyền truy cập</span>
            ) : (
              <span className="text-sm text-gray-500 dark:text-slate-400">
                {isLoading
                  ? <span className="flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</span>
                  : <><span className="font-semibold text-gray-900 dark:text-slate-100">{logs.length}</span> sự kiện{hasFilters ? <span className="ml-1.5 rounded bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">đã lọc</span> : ""}</>
                }
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <span className="text-xs">Hiển thị</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-7 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 text-xs text-gray-700 dark:text-slate-300 focus:outline-none"
            >
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-xs">/ trang</span>
          </div>
        </div>

        <AuditLogTable
          logs={pageLogs}
          isAdmin={isAdmin}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-slate-700 px-4 py-2.5">
            <span className="text-xs text-gray-400 dark:text-slate-500">
              Trang <span className="font-semibold text-gray-700 dark:text-slate-300">{safePage}</span> / {totalPages}
              <span className="mx-1.5 text-gray-300 dark:text-slate-600">·</span>
              {logs.length} bản ghi
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-400 transition hover:bg-gray-50 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={13} />
              </button>

              {buildPageNumbers().map((item, idx) =>
                item === "…" ? (
                  <span key={`ellipsis-${idx}`} className="flex h-7 w-7 items-center justify-center text-xs text-gray-400 dark:text-slate-500">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item as number)}
                    className={`flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition
                      ${item === safePage
                        ? "bg-blue-600 text-white"
                        : "border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-600"
                      }`}
                  >
                    {item}
                  </button>
                )
              )}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-400 transition hover:bg-gray-50 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirmAction === "selected"}
        title="Xóa log đã chọn"
        description={`Bạn chắc chắn muốn xóa ${selectedIds.size} log đã chọn? Hành động này không thể hoàn tác.`}
        confirmLabel={isDeleting ? "Đang xóa…" : `Xóa ${selectedIds.size} log`}
        danger
        onConfirm={execDeleteSelected}
        onCancel={() => !isDeleting && setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "byType"}
        title={`Dọn log "${cleanType}"`}
        description={`Xóa toàn bộ log có loại "${cleanType}" khỏi hệ thống? Hành động này không thể hoàn tác.`}
        confirmLabel={isDeleting ? "Đang xóa…" : "Xóa tất cả"}
        danger
        onConfirm={execCleanByType}
        onCancel={() => !isDeleting && setConfirmAction(null)}
      />

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-lg transition
            ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.ok
            ? <CheckCircle className="h-4 w-4 shrink-0" />
            : <XCircle className="h-4 w-4 shrink-0" />
          }
          {toast.msg}
        </div>
      )}
    </div>
  );
}
