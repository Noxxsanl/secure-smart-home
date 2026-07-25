"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import Breadcrumb from "@/widgets/app-shell/Breadcrumb";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import SeverityBadge from "@/shared/ui/SeverityBadge";
import type { MockNotification } from "@/shared/mock/types";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)     return "Vừa xong";
  if (diff < 3600)   return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

function NotifItem({ n, onMarkRead }: { n: MockNotification; onMarkRead: (id: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => !n.is_read && onMarkRead(n.id)}
      className={`flex w-full gap-3 border-b border-gray-50 dark:border-slate-700 px-4 py-3 text-left transition-colors last:border-0
        ${n.is_read
          ? "bg-white hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-700"
          : "bg-brand-soft/40 hover:bg-brand-soft/70"}`}
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
        <Bell size={14} className="text-gray-500 dark:text-slate-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${n.is_read ? "font-medium text-gray-700 dark:text-slate-300" : "font-semibold text-gray-900 dark:text-slate-100"}`}>
            {n.title}
          </p>
          {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-slate-400">{n.message}</p>
        <div className="mt-1 flex items-center gap-2">
          <SeverityBadge severity={n.severity} showIcon={false} />
          <span className="text-[10px] text-gray-400 dark:text-slate-500">{relativeTime(n.created_at)}</span>
        </div>
      </div>
    </button>
  );
}

export default function Header() {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const latest = notifications.slice(0, 5);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="flex h-20 shrink-0 items-center justify-between border-b border-[#E5EAF0] dark:border-slate-700 bg-[#F8F9FB] dark:bg-slate-900 px-6">
      <Breadcrumb />

      <div className="flex items-center gap-4">
        <ThemeToggle />

        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 transition hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
            aria-label="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-critical text-[10px] font-bold text-white shadow">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 z-50 mt-1.5 w-80 overflow-hidden rounded border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Thông báo</p>
                  {unreadCount > 0 && (
                    <span className="rounded bg-critical-soft px-1.5 py-0.5 text-[10px] font-bold text-critical">
                      {unreadCount} chưa đọc
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllRead()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand transition hover:brightness-90"
                  >
                    <CheckCheck size={12} />
                    Đánh dấu tất cả
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {latest.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10">
                    <Bell className="mb-2 h-8 w-8 text-gray-200 dark:text-slate-700" />
                    <p className="text-sm text-gray-400 dark:text-slate-500">Chưa có thông báo mới</p>
                  </div>
                ) : (
                  latest.map((n) => <NotifItem key={n.id} n={n} onMarkRead={markRead} />)
                )}
              </div>

              <Link
                href="/notifications"
                onClick={() => setNotifOpen(false)}
                className="block border-t border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5 text-center text-xs font-semibold text-brand transition hover:brightness-90"
              >
                Xem tất cả thông báo
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
