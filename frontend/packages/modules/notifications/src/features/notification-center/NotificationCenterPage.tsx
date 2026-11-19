"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, RefreshCw, Search } from "lucide-react";
import { useNotifications } from "../../api/useNotifications";
import {
  SeverityBadge, EmptyState, useToast, LoadErrorBar, BTN_PRIMARY, BTN_SECONDARY, CARD, SEARCH_INPUT,
} from "@shh/ui";
import { formatDateTime, formatRelative } from "@shh/utils";
import type { Severity } from "@shh/api-client/dashboard";

const FILTERS: { value: Severity | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
];

const LIMITS = [50, 100, 200];

export default function NotificationCenterPage() {
  const [limit, setLimit] = useState(LIMITS[0]);
  const { notifications, unreadCount, isLoading, error, markRead, markAllRead } = useNotifications(limit);
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Severity | "all">("all");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const filtered = notifications
    .filter((n) => filter === "all" || n.severity === filter)
    .filter((n) => !onlyUnread || !n.is_read)
    .filter((n) => !needle || n.title.toLowerCase().includes(needle) || n.message.toLowerCase().includes(needle));

  async function handleMarkRead(id: number) {
    if (!(await markRead(id))) showToast("Chưa đánh dấu được thông báo. Thử lại sau giây lát.", false);
  }

  async function handleMarkAll() {
    if (await markAllRead()) showToast("Đã đánh dấu tất cả là đã đọc.");
    else showToast("Chưa đánh dấu được. Kiểm tra kết nối rồi thử lại.", false);
  }

  const canLoadMore = notifications.length >= limit && limit < LIMITS[LIMITS.length - 1];

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Notification Center</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc.` : "Tất cả thông báo đã được đọc."} Sự kiện vận hành gửi cho vai trò của bạn.
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" onClick={handleMarkAll} className={BTN_PRIMARY}>
            <CheckCheck className="h-3.5 w-3.5" />
            Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <label className="ml-1 flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-slate-400">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
          Chỉ chưa đọc
        </label>
        <div className="relative ml-auto min-w-48 max-w-72 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Tìm trong tiêu đề, nội dung…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={SEARCH_INPUT}
          />
        </div>
      </div>

      <div className={`overflow-hidden ${CARD}`}>
        {!!error && <LoadErrorBar error={error} />}
        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400 dark:text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Bell} title="Không có thông báo nào" description="Thử đổi bộ lọc hoặc từ khoá tìm kiếm." />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {filtered.map((n) => (
              <li
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3.5 transition-colors
                  ${n.is_read ? "bg-white dark:bg-slate-800" : "bg-brand-soft/40"}`}
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
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 dark:text-slate-500">
                    <span title={formatDateTime(n.created_at)}>{formatRelative(n.created_at, "—")}</span>
                    {n.actor_username && <span>bởi {n.actor_username}{n.actor_role ? ` (${n.actor_role})` : ""}</span>}
                    {n.home_id && (
                      <Link href={`/smart-homes/${n.home_id}`} className="font-medium text-brand hover:brightness-90">Xem Smart Home →</Link>
                    )}
                    {n.related_device_id && (
                      <Link href={`/devices/${n.related_device_id}`} className="font-medium text-brand hover:brightness-90">Xem thiết bị →</Link>
                    )}
                  </div>
                </div>
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n.id)}
                    className="shrink-0 rounded px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft"
                  >
                    Đã đọc
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canLoadMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setLimit(LIMITS[LIMITS.indexOf(limit) + 1] ?? limit)}
            className={BTN_SECONDARY}
          >
            Xem thêm thông báo cũ hơn
          </button>
        </div>
      )}
    </div>
  );
}
