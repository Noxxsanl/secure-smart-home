"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FileSearch } from "lucide-react";
import { SeverityBadge, EmptyState, MUTED_DASH, TABLE_HEAD_ROW, TH } from "@shh/ui";
import { formatDateTimeSeconds } from "@shh/utils";
import type { LogEntry } from "@shh/api-client/dashboard";

type LogTableProps = {
  logs: LogEntry[];
  /** Có thì hiện cột chọn dòng (Admin xoá hàng loạt). */
  selectable?: boolean;
  selectedIds?: Set<number>;
  onToggle?: (id: number) => void;
  onToggleAll?: (ids: number[]) => void;
  emptyTitle?: string;
  emptyDescription?: string;
};

// Chi tiết JSON của một dòng log (FR-10.4) — gập/mở từng dòng. Backend không
// bao giờ ghi secret vào `details`, nhưng UI vẫn chỉ hiển thị nguyên văn những gì nhận được.
function JsonDetails({ details }: { details: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!details || Object.keys(details).length === 0) return <span className={MUTED_DASH}>—</span>;

  const preview = Object.keys(details).slice(0, 2).join(", ");

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:bg-gray-100 dark:hover:bg-slate-600"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="font-mono">{open ? "Ẩn" : `{${preview}…}`}</span>
      </button>
      {open && (
        <pre className="mt-2 max-h-64 max-w-md overflow-auto rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 p-2 text-xs leading-relaxed text-gray-700 dark:text-slate-300">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

// Bảng log dùng chung cho Log Center, tab Log của Smart Home và Gateway Detail.
export default function LogTable({
  logs, selectable = false, selectedIds, onToggle, onToggleAll,
  emptyTitle = "Không có sự kiện nào", emptyDescription = "Thử điều chỉnh bộ lọc để tìm kết quả khác.",
}: LogTableProps) {
  if (logs.length === 0) {
    return <EmptyState icon={FileSearch} title={emptyTitle} description={emptyDescription} />;
  }

  const allSelected = logs.every((l) => selectedIds?.has(l.id));
  const someSelected = !allSelected && logs.some((l) => selectedIds?.has(l.id));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full table-auto text-left text-sm">
        <thead>
          <tr className={TABLE_HEAD_ROW}>
            {selectable && (
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={() => onToggleAll?.(logs.map((l) => l.id))}
                  className="h-3.5 w-3.5 cursor-pointer rounded accent-brand"
                  title="Chọn tất cả trên trang này"
                  aria-label="Chọn tất cả log trên trang này"
                />
              </th>
            )}
            <th className={TH}>Thời gian</th>
            <th className={TH}>Mức độ</th>
            <th className={TH}>Nhà / Thiết bị</th>
            <th className={TH}>Người thực hiện</th>
            <th className={TH}>Thông điệp</th>
            <th className={TH}>Chi tiết</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
          {logs.map((log) => {
            const checked = selectedIds?.has(log.id) ?? false;
            const subject = log.device_uid ?? log.gateway_uid;
            return (
              <tr
                key={log.id}
                className={`align-top transition-colors hover:bg-brand-soft/30 ${checked ? "bg-brand-soft/50" : "bg-white dark:bg-slate-800"}`}
              >
                {selectable && (
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle?.(log.id)}
                      className="h-3.5 w-3.5 cursor-pointer rounded accent-brand"
                      aria-label={`Chọn log #${log.id}`}
                    />
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-2.5">
                  <span className="font-mono text-xs text-gray-500 dark:text-slate-400">{formatDateTimeSeconds(log.timestamp)}</span>
                </td>
                <td className="px-4 py-2.5"><SeverityBadge severity={log.severity} /></td>
                <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-slate-300">
                  {log.home_id && log.home_name ? (
                    <Link href={`/smart-homes/${log.home_id}`} className="font-medium hover:text-brand">{log.home_name}</Link>
                  ) : log.home_name ? (
                    log.home_name
                  ) : null}
                  {subject && <p className="font-mono text-[11px] text-gray-400 dark:text-slate-500">{subject}</p>}
                  {!log.home_name && !subject && <span className={MUTED_DASH}>—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-slate-300">
                  {log.actor_username ?? <span className={MUTED_DASH}>hệ thống</span>}
                  {log.ip_address && <p className="font-mono text-[11px] text-gray-400 dark:text-slate-500">{log.ip_address}</p>}
                </td>
                <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300">
                  {log.message}
                  <p className="font-mono text-[11px] text-gray-400 dark:text-slate-500">{log.event_type}</p>
                </td>
                <td className="px-4 py-2.5"><JsonDetails details={log.details} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
