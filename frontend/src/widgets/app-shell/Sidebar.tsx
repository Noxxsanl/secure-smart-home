"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wifi, MoreVertical, LogOut, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import { NAV_SECTIONS, LOG_CATEGORY_CONFIG, type BadgeKey, type NavRole } from "@/widgets/app-shell/nav-config";
import {
  smartHomeStore, gatewayStore, firmwareStore, notificationStore,
} from "@/shared/mock/store";

const ROLE_LABELS: Record<string, string> = {
  admin:    "Quản trị viên",
  operator: "Vận hành",
};

function useBadgeCounts(role: NavRole | undefined): Record<BadgeKey, number> {
  return useMemo(() => {
    if (!role) return { unclaimedHomes: 0, offlineGateways: 0, otaInProgress: 0, unreadNotifications: 0 };
    return {
      unclaimedHomes: smartHomeStore.list().filter((h) => h.status === "unclaimed").length,
      offlineGateways: gatewayStore.list().filter((g) => g.status === "offline").length,
      otaInProgress: firmwareStore.listDeployments().filter((d) => d.status === "in_progress").length,
      unreadNotifications: notificationStore.listForRole(role).filter((n) => !n.is_read).length,
    };
  }, [role]);
}

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export default function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const role = (user?.role as NavRole | undefined) ?? undefined;

  const [menuOpen, setMenuOpen]       = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [logsOpen, setLogsOpen]       = useState(pathname.startsWith("/logs"));
  const menuRef = useRef<HTMLDivElement>(null);

  const badges = useBadgeCounts(role);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !role || item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);

  const visibleLogCategories = LOG_CATEGORY_CONFIG.filter((c) => !role || c.roles.includes(role));

  return (
    <>
      <aside
        className={`fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-900 transition-all
          ${collapsed ? "w-16" : "w-60"}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-[#E5EAF0] dark:border-slate-700 px-4 py-3.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand text-white">
            <Wifi size={14} />
          </div>
          {!collapsed && <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">Smart Home Platform</p>}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5">
          {sections.map((section) => (
            <div key={section.section} className="mb-3.5">
              {!collapsed && (
                <p className="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                  {section.section}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map(({ label, href, icon: Icon, badgeKey }) => {
                  const isLogsItem = href === "/logs/gateway";
                  const isActive = isLogsItem
                    ? pathname.startsWith("/logs")
                    : (pathname === href || (href !== "/dashboard" && pathname.startsWith(href)));
                  const badgeValue = badgeKey ? badges[badgeKey] : 0;

                  if (isLogsItem) {
                    return (
                      <li key={href}>
                        <button
                          type="button"
                          onClick={() => (collapsed ? onToggleCollapsed() : setLogsOpen((v) => !v))}
                          className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors
                            ${isActive ? "bg-brand-soft text-brand" : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100"}`}
                          title={collapsed ? label : undefined}
                        >
                          <Icon size={15} className={isActive ? "text-brand" : "text-gray-400 dark:text-slate-500"} />
                          {!collapsed && <span className="flex-1 text-left">{label}</span>}
                          {!collapsed && <ChevronDown size={13} className={`transition-transform ${logsOpen ? "rotate-180" : ""}`} />}
                        </button>
                        {!collapsed && logsOpen && (
                          <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-gray-100 dark:border-slate-700 pl-2.5">
                            {visibleLogCategories.map((cat) => {
                              const catHref = `/logs/${cat.category}`;
                              const catActive = pathname === catHref;
                              return (
                                <li key={cat.category}>
                                  <Link
                                    href={catHref}
                                    className={`block rounded px-2.5 py-1.5 text-xs font-medium transition-colors
                                      ${catActive ? "bg-brand-soft text-brand" : "text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-800 dark:hover:text-slate-200"}`}
                                  >
                                    {cat.label}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  }

                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        title={collapsed ? label : undefined}
                        className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors
                          ${isActive
                            ? "bg-brand-soft text-brand"
                            : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100"
                          }`}
                      >
                        <Icon size={15} className={isActive ? "text-brand" : "text-gray-400 dark:text-slate-500"} />
                        {!collapsed && <span className="flex-1">{label}</span>}
                        {!collapsed && !!badgeValue && (
                          <span className="rounded-full bg-critical px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {badgeValue}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="mx-2.5 mb-2 flex h-7 items-center justify-center rounded border border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 transition hover:bg-gray-50 dark:hover:bg-slate-800"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        {/* User section */}
        <div className="border-t border-[#E5EAF0] dark:border-slate-700 p-2.5">
          <div ref={menuRef} className="relative">
            <div className="flex items-center gap-2.5 rounded bg-gray-50 dark:bg-slate-800 px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold uppercase text-white">
                {user?.username?.[0] ?? "?"}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">
                    {user?.role ? (ROLE_LABELS[user.role] ?? user.role) : "—"}
                  </p>
                  <p className="truncate text-xs font-medium text-gray-900 dark:text-slate-100">
                    {user?.username ?? "—"}
                  </p>
                </div>
              )}
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 dark:text-slate-500 transition hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-300"
                  aria-label="More options"
                >
                  <MoreVertical size={13} />
                </button>
              )}
            </div>

            {menuOpen && !collapsed && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-md">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-critical transition hover:bg-critical-soft"
                >
                  <LogOut size={13} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmOpen}
        title="Đăng xuất"
        description="Bạn có chắc muốn đăng xuất?"
        confirmLabel="Đăng xuất"
        cancelLabel="Huỷ"
        danger
        onConfirm={() => { setConfirmOpen(false); logout(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
