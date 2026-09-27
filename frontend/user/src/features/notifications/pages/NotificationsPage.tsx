"use client";

import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import SeverityBadge from "@smarthome/shared/ui/SeverityBadge";
import EmptyState from "@smarthome/shared/ui/EmptyState";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import { relativeTime } from "@smarthome/shared/lib/time";
import type { NotificationSeverity } from "@smarthome/shared/mock/types";
import HomeGate from "@/features/home/components/HomeGate";
import { useHomeNotifications } from "@/features/notifications/hooks/useHomeNotifications";

const FILTERS: { value: NotificationSeverity | "all" | "unread"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "unread", label: "Chưa đọc" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
];

function Notifications() {
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useHomeNotifications();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");

  const filtered = notifications.filter((n) =>
    filter === "all" ? true : filter === "unread" ? !n.is_read : n.severity === filter
  );

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Thông báo</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc.` : "Bạn đã đọc hết thông báo."}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button" onClick={() => markAllRead()}
            className="inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value} type="button" onClick={() => setFilter(value)}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition
              ${filter === value ? "bg-brand text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        {isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Bell} title="Không có thông báo nào" description="Thử đổi bộ lọc." />
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

export default function NotificationsPage() {
  return <HomeGate>{() => <Notifications />}</HomeGate>;
}
