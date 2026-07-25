"use client";

import { useMemo, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import SeverityBadge from "@/shared/ui/SeverityBadge";
import EmptyState from "@/shared/ui/EmptyState";
import type { NotificationSeverity } from "@/shared/mock/types";

const FILTERS: { value: NotificationSeverity | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
];

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)     return "Vừa xong";
  if (diff < 3600)   return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

export default function NotificationCenterPage() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<NotificationSeverity | "all">("all");

  const filtered = useMemo(
    () => (filter === "all" ? notifications : notifications.filter((n) => n.severity === filter)),
    [notifications, filter]
  );

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Notification Center</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc.` : "Tất cả thông báo đã được đọc."}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead()}
            className="inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition
              ${filter === value ? "bg-brand text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        {filtered.length === 0 ? (
          <EmptyState icon={Bell} title="Không có thông báo nào" description="Thử đổi bộ lọc mức độ nghiêm trọng." />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {filtered.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors
                    ${n.is_read ? "bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50" : "bg-brand-soft/40 hover:bg-brand-soft/70"}`}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
                    <Bell size={14} className="text-gray-500 dark:text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm ${n.is_read ? "font-medium text-gray-700 dark:text-slate-300" : "font-semibold text-gray-900 dark:text-slate-100"}`}>
                        {n.title}
                      </p>
                      <SeverityBadge severity={n.severity} />
                      {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{n.message}</p>
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">{relativeTime(n.created_at)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
