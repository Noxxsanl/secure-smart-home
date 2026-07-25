"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { useLogEntries } from "@/features/logs/hooks/useLogEntries";
import { usePermissions } from "@/features/auth/hooks/usePermissions";
import LogTable from "@/features/logs/components/LogTable";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import { useToast } from "@/shared/ui/Toast";
import { logStore } from "@/shared/mock/store";
import { LOG_CATEGORY_CONFIG, LOG_CATEGORY_ICONS } from "@/widgets/app-shell/nav-config";
import type { LogCategory, LogSeverity } from "@/shared/mock/types";

const SEVERITIES: { value: LogSeverity | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
];

export default function LogCategoryPage() {
  const { category } = useParams<{ category: string }>();
  const cat = (category as LogCategory) ?? "gateway";
  const config = LOG_CATEGORY_CONFIG.find((c) => c.category === cat);
  const Icon = LOG_CATEGORY_ICONS[cat] ?? LOG_CATEGORY_ICONS.gateway;

  const { isAdmin } = usePermissions();
  const { showToast } = useToast();
  const { logs, isLoading, refresh } = useLogEntries(cat);

  const [severity, setSeverity] = useState<LogSeverity | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filtered = useMemo(() => {
    return logs
      .filter((l) => severity === "all" || l.severity === severity)
      .filter((l) => (search.trim() ? l.message.toLowerCase().includes(search.toLowerCase()) : true));
  }, [logs, severity, search]);

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

  function handleDeleteSelected() {
    logStore.bulkDelete(Array.from(selectedIds));
    const count = selectedIds.size;
    setSelectedIds(new Set());
    refresh();
    showToast(`Đã xoá ${count} log.`);
    setConfirmDelete(false);
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
          <Icon className="h-4 w-4 text-gray-500 dark:text-slate-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{config?.label ?? "Log"}</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{filtered.length} sự kiện.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5 gap-0.5">
          {SEVERITIES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSeverity(value)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${severity === value ? "bg-brand-soft text-brand" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-48 max-w-72 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            type="text" placeholder="Tìm trong thông điệp…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 pl-8 pr-3 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
          />
        </div>
        <button type="button" onClick={() => refresh()}
          className="inline-flex items-center gap-1.5 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-400 transition hover:bg-gray-50 dark:hover:bg-slate-700">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Làm mới
        </button>
      </div>

      {isAdmin && selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-warning/30 bg-warning-soft px-4 py-2.5">
          <span className="text-sm font-semibold text-warning">{selectedIds.size} đã chọn</span>
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 rounded bg-critical px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-90">
            <Trash2 className="h-3.5 w-3.5" /> Xoá đã chọn
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <LogTable
          logs={filtered}
          isAdmin={isAdmin}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Xoá log đã chọn"
        description={`Xoá vĩnh viễn ${selectedIds.size} log đã chọn?`}
        confirmLabel="Xoá"
        danger
        onConfirm={handleDeleteSelected}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
