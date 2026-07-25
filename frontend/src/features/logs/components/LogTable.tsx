"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileSearch } from "lucide-react";
import SeverityBadge from "@/shared/ui/SeverityBadge";
import EmptyState from "@/shared/ui/EmptyState";
import { smartHomeStore } from "@/shared/mock/store";
import type { LogEntry } from "@/shared/mock/types";

type Props = {
  logs: LogEntry[];
  isAdmin?: boolean;
  selectedIds?: Set<number>;
  onToggle?: (id: number) => void;
  onToggleAll?: (ids: number[]) => void;
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${time} ${date}`;
}

function JsonDetails({ details }: { details: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!details) return <span className="text-gray-300 dark:text-slate-600">—</span>;

  const keys = Object.keys(details);
  const preview = keys.slice(0, 2).join(", ");

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:bg-gray-100 dark:hover:bg-slate-600"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="font-mono">{open ? "Ẩn" : `{${preview}…}`}</span>
      </button>
      {open && (
        <pre className="mt-2 max-w-xs overflow-x-auto rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 p-2 text-xs leading-relaxed text-gray-700 dark:text-slate-300">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

// Generalized from the original AuditLogTable — same filter/pagination/bulk-
// delete UX, now config-driven by `LogEntry.category` instead of one fixed
// audit-log shape, so it covers all 10 log categories.
export default function LogTable({ logs, isAdmin, selectedIds, onToggle, onToggleAll }: Props) {
  if (logs.length === 0) {
    return <EmptyState icon={FileSearch} title="Không có sự kiện nào" description="Thử điều chỉnh bộ lọc để tìm kết quả khác" />;
  }

  const allSelected  = logs.length > 0 && logs.every((l) => selectedIds?.has(l.id));
  const someSelected = !allSelected && logs.some((l) => selectedIds?.has(l.id));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full table-auto text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900">
            {isAdmin && (
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={() => onToggleAll?.(logs.map((l) => l.id))}
                  className="h-3.5 w-3.5 cursor-pointer rounded accent-brand"
                  title="Chọn tất cả trên trang này"
                />
              </th>
            )}
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thời gian</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Mức độ</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Smart Home / Gateway</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thông điệp</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Chi tiết</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
          {logs.map((log) => {
            const checked = selectedIds?.has(log.id) ?? false;
            const home = log.home_id ? smartHomeStore.get(log.home_id) : null;
            return (
              <tr
                key={log.id}
                className={`transition-colors hover:bg-brand-soft/30 ${checked ? "bg-brand-soft/50" : "bg-white dark:bg-slate-800"}`}
              >
                {isAdmin && (
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle?.(log.id)}
                      className="h-3.5 w-3.5 cursor-pointer rounded accent-brand"
                    />
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-2.5">
                  <span className="font-mono text-xs text-gray-500 dark:text-slate-400">{formatTime(log.timestamp)}</span>
                </td>
                <td className="px-4 py-2.5"><SeverityBadge severity={log.severity} /></td>
                <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-slate-300">
                  {home ? home.name : log.gateway_uid ? <span className="font-mono">{log.gateway_uid}</span> : <span className="text-gray-300 dark:text-slate-600">—</span>}
                </td>
                <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300">{log.message}</td>
                <td className="px-4 py-2.5"><JsonDetails details={log.details} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
