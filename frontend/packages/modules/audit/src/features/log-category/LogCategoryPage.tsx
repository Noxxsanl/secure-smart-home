"use client";

import { useState } from "react";
import { notFound, useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useLogEntries } from "../../api/useLogEntries";
import { useHomeOptions } from "@shh/api-client/dashboard";
import { usePermissions, useStaffRole } from "@shh/auth";
import LogTable from "../../ui/LogTable";
import {
  ConfirmModal, LoadErrorBar, useToast, BTN_DANGER, BTN_SECONDARY, BTN_SM, CARD, INPUT, SEARCH_INPUT, SEGMENTED, SELECT_SM, TOOLBAR, segmentButton,
} from "@shh/ui";
import { LOG_CATEGORY_ICONS, logCategoriesFor } from "../../model/categories";
import { deleteLogs } from "../../api/logs.api";
import { useDebouncedValue, localInputToIso } from "@shh/utils";
import type { LogCategory, LogFilters, Severity } from "@shh/api-client/dashboard";

const SEVERITIES: { value: Severity | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
];

const PAGE_SIZES = [25, 50, 100, 200];

export default function LogCategoryPage() {
  const { category } = useParams<{ category: string }>();
  // Chỉ những loại log role hiện tại được xem — gõ URL loại khác sẽ nhận 404
  // (backend cũng trả 403 nếu Operator gọi thẳng API).
  const config = logCategoriesFor(useStaffRole()).find((c) => c.category === category);
  if (!config) notFound();
  // key = loại log → chuyển loại thì toàn bộ bộ lọc/trang/lựa chọn được đặt lại.
  return <LogCategoryView key={config.category} category={config.category} label={config.label} />;
}

function LogCategoryView({ category, label }: { category: LogCategory; label: string }) {
  const Icon = LOG_CATEGORY_ICONS[category];
  const { canDeleteLogs } = usePermissions();
  const { showToast } = useToast();
  const { homes } = useHomeOptions();

  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [homeId, setHomeId] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actor, setActor] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const debouncedActor = useDebouncedValue(actor, 350);
  const debouncedSearch = useDebouncedValue(search, 350);

  const filters: LogFilters = {
    home_id: homeId,
    severity: severity === "all" ? null : severity,
    from: localInputToIso(from),
    to: localInputToIso(to),
    actor: debouncedActor,
    q: debouncedSearch,
    page,
    limit,
  };
  const { logs, total, isLoading, isValidating, error, refresh } = useLogEntries(category, filters);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const firstShown = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastShown = Math.min(total, page * limit);
  const hasFilter = severity !== "all" || homeId !== null || !!from || !!to || !!actor || !!search;

  function clearFilters() {
    setSeverity("all"); setHomeId(null); setFrom(""); setTo(""); setActor(""); setSearch(""); setPage(1);
  }

  function handleToggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleAll(ids: number[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selectedIds);
    await deleteLogs(category, ids);
    setSelectedIds(new Set());
    setPage(1);
    await refresh();
    showToast(`Đã xoá ${ids.length} log.`);
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
          <Icon className="h-4 w-4 text-gray-500 dark:text-slate-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{label}</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {isLoading && logs.length === 0 ? "Đang tải…" : `${total} sự kiện${hasFilter ? " khớp bộ lọc" : ""}.`}
            {" "}Log chỉ ghi thêm, tự cập nhật mỗi 30 giây.
          </p>
        </div>
      </div>

      <div className={`overflow-hidden ${CARD}`}>
        <div className={TOOLBAR}>
          <div className={SEGMENTED}>
            {SEVERITIES.map(({ value, label: text }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setSeverity(value); setPage(1); }}
                className={segmentButton(severity === value)}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {hasFilter && (
              <button type="button" onClick={clearFilters} className={BTN_SM}>
                <X className="h-3 w-3" /> Xoá bộ lọc
              </button>
            )}
            <button type="button" onClick={() => void refresh()} className={BTN_SM}>
              <RefreshCw className={`h-3 w-3 ${isValidating ? "animate-spin" : ""}`} /> Làm mới
            </button>
          </div>
        </div>

        <div className="grid gap-2.5 border-b border-gray-200 dark:border-slate-700 px-4 py-3 sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <label htmlFor="log-home" className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-slate-400">Smart Home</label>
            <select
              id="log-home"
              value={homeId ?? ""}
              onChange={(e) => { setHomeId(e.target.value ? Number(e.target.value) : null); setPage(1); }}
              className={`${SELECT_SM} w-full`}
            >
              <option value="">Tất cả nhà</option>
              {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="log-from" className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-slate-400">Từ lúc</label>
            <input
              id="log-from" type="datetime-local" value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className={`${INPUT} h-8 text-xs`}
            />
          </div>
          <div>
            <label htmlFor="log-to" className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-slate-400">Đến lúc</label>
            <input
              id="log-to" type="datetime-local" value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className={`${INPUT} h-8 text-xs`}
            />
          </div>
          <div>
            <label htmlFor="log-actor" className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-slate-400">Người thực hiện</label>
            <input
              id="log-actor" type="text" value={actor} placeholder="Tên đăng nhập…"
              onChange={(e) => { setActor(e.target.value); setPage(1); }}
              className={`${INPUT} h-8 text-xs`}
            />
          </div>
          <div>
            <label htmlFor="log-q" className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-slate-400">Tìm trong thông điệp</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                id="log-q" type="text" value={search} placeholder="Từ khoá…"
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className={SEARCH_INPUT}
              />
            </div>
          </div>
        </div>

        {canDeleteLogs && selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-warning/30 bg-warning-soft px-4 py-2.5">
            <span className="text-sm font-semibold text-warning">{selectedIds.size} log đã chọn</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelectedIds(new Set())} className={BTN_SECONDARY}>Bỏ chọn</button>
              <button type="button" onClick={() => setConfirmDelete(true)} className={BTN_DANGER}>
                <Trash2 className="h-3.5 w-3.5" /> Xoá đã chọn
              </button>
            </div>
          </div>
        )}

        {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

        <LogTable
          logs={logs}
          selectable={canDeleteLogs}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
          emptyTitle={isLoading ? "Đang tải…" : page > totalPages ? "Trang này không còn log" : "Không có sự kiện nào"}
          emptyDescription={
            page > totalPages
              ? "Dữ liệu vừa thay đổi. Quay về trang cuối để xem tiếp."
              : hasFilter ? "Thử nới lỏng bộ lọc hoặc mở rộng khoảng thời gian." : "Loại log này chưa ghi nhận sự kiện nào."
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5 text-xs text-gray-500 dark:text-slate-400">
          <span>
            {total === 0 ? "Không có dòng nào" : `Dòng ${firstShown}–${lastShown} / ${total}`}
          </span>
          <div className="flex items-center gap-2">
            <label htmlFor="log-limit" className="sr-only">Số dòng mỗi trang</label>
            <select
              id="log-limit" value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className={SELECT_SM}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} dòng/trang</option>)}
            </select>
            <button
              type="button" onClick={() => setPage(Math.max(1, Math.min(page, totalPages) - 1))}
              disabled={page <= 1} className={BTN_SM} aria-label="Trang trước"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="font-medium text-gray-700 dark:text-slate-300">Trang {Math.min(page, totalPages)}/{totalPages}</span>
            <button
              type="button" onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages} className={BTN_SM} aria-label="Trang sau"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
            {page > totalPages && (
              <button type="button" onClick={() => setPage(totalPages)} className={BTN_SM}>Về trang cuối</button>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Xoá log đã chọn"
          subtitle={label}
          icon={Trash2}
          danger
          description={
            <>
              Xoá vĩnh viễn <span className="font-semibold">{selectedIds.size}</span> dòng log? Hành động không hoàn tác được;
              việc xoá được ghi lại bằng một dòng log riêng (không xoá được dòng đó).
            </>
          }
          confirmLabel="Xoá"
          onConfirm={handleDeleteSelected}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
