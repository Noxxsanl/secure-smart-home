"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell, UserCheck, Server, Lock, Unlock, Activity, Trash2, CheckCheck,
} from "lucide-react";
import Breadcrumb from "@/widgets/app-shell/Breadcrumb";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import type { AppNotification } from "@/shared/types/api";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";

const DAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
function pad(n: number) { return String(n).padStart(2, "0"); }

function ClockDisplay() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const date = `${DAYS[now.getDay()]} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return (
    <div className="flex flex-col items-end leading-tight select-none">
      <span className="font-mono text-base font-bold tabular-nums text-gray-800 dark:text-slate-200">{time}</span>
      <span className="text-[11px] text-gray-400 dark:text-slate-500">{date}</span>
    </div>
  );
}

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)     return "Vừa xong";
  if (diff < 3600)   return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

const TYPE_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  LOGIN:               { icon: UserCheck, color: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-900/30" },
  DEVICE_REGISTER:     { icon: Server,    color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
  DEVICE_BLOCKED:      { icon: Lock,      color: "text-red-500",     bg: "bg-red-50 dark:bg-red-900/30" },
  DEVICE_UNBLOCKED:    { icon: Unlock,    color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
  DEVICE_STATUS_CHANGE:{ icon: Activity,  color: "text-amber-500",   bg: "bg-amber-50 dark:bg-amber-900/30" },
  DEVICE_DELETE:       { icon: Trash2,    color: "text-red-500",     bg: "bg-red-50 dark:bg-red-900/30" },
};

function NotifItem({
  n,
  onMarkRead,
}: {
  n: AppNotification;
  onMarkRead: (id: number) => void;
}) {
  const meta = TYPE_META[n.type] ?? { icon: Bell, color: "text-gray-400", bg: "bg-gray-100 dark:bg-slate-700" };
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => !n.is_read && onMarkRead(n.id)}
      className={`flex w-full gap-3 border-b border-gray-50 dark:border-slate-700 px-4 py-3 text-left transition-colors last:border-0
        ${n.is_read
          ? "bg-white hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-700"
          : "bg-blue-50/40 hover:bg-blue-50/70 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"}`}
    >
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded ${meta.bg}`}>
        <Icon size={14} className={meta.color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${n.is_read ? "font-medium text-gray-700 dark:text-slate-300" : "font-semibold text-gray-900 dark:text-slate-100"}`}>
            {n.title}
          </p>
          {!n.is_read && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-slate-400">{n.message}</p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400 dark:text-slate-500">
          <span className="rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 font-medium capitalize">{n.actor_role}</span>
          <span>{relativeTime(n.created_at)}</span>
        </div>
      </div>
    </button>
  );
}

export default function Header() {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markRead, markAllRead, isAdmin } = useNotifications();

  // Đóng dropdown thông báo khi người dùng click ra ngoài panel.
  // Dùng mousedown (không phải click) để panel đóng trước khi click handler bên trong
  // dropdown kích hoạt, tránh nhấp nháy do thứ tự sự kiện.
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
        <ClockDisplay />
        <ThemeToggle />

        {isAdmin && (
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 transition hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow">
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
                      <span className="rounded bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                        {unreadCount} chưa đọc
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 transition hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      <CheckCheck size={12} />
                      Đánh dấu tất cả
                    </button>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10">
                      <Bell className="mb-2 h-8 w-8 text-gray-200 dark:text-slate-700" />
                      <p className="text-sm text-gray-400 dark:text-slate-500">Chưa có thông báo mới</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <NotifItem key={n.id} n={n} onMarkRead={markRead} />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
