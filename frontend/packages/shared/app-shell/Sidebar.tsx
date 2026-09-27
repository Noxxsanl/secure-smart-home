"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wifi, MoreVertical, LogOut, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useAuth } from "@smarthome/shared/auth/hooks/useAuth";
import { ROLE_LABELS } from "@smarthome/shared/auth/types";
import ConfirmDialog from "@smarthome/shared/ui/ConfirmDialog";
import { isNavGroup, type NavGroup, type NavSection } from "@smarthome/shared/app-shell/types";

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Chỉ tô sáng mục có href khớp dài nhất — tránh "/smart-homes" và
// "/smart-homes/new" (Provisioning) cùng sáng một lúc.
function findActiveHref(sections: NavSection[], pathname: string): string | null {
  let best: string | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      const hrefs = isNavGroup(item) ? item.children.map((c) => c.href) : [item.href];
      for (const href of hrefs) {
        if (matches(pathname, href) && (!best || href.length > best.length)) best = href;
      }
    }
  }
  return best;
}

function groupContains(group: NavGroup, href: string | null) {
  return !!href && group.children.some((c) => c.href === href);
}

type SidebarProps = {
  sections: NavSection[];
  badges?: Record<string, number>;
  brandName: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export default function Sidebar({ sections, badges = {}, brandName, collapsed, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const activeHref = findActiveHref(sections, pathname);

  const [menuOpen, setMenuOpen]       = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [openGroups, setOpenGroups]   = useState<Set<string>>(() => {
    const initial = new Set<string>();
    sections.forEach((s) => s.items.forEach((item) => {
      if (isNavGroup(item) && groupContains(item, activeHref)) initial.add(item.label);
    }));
    return initial;
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

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
          {!collapsed && <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{brandName}</p>}
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
                {section.items.map((item) => {
                  const Icon = item.icon;

                  if (isNavGroup(item)) {
                    const isActive = groupContains(item, activeHref);
                    const isOpen = openGroups.has(item.label);
                    return (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={() => (collapsed ? onToggleCollapsed() : toggleGroup(item.label))}
                          className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors
                            ${isActive ? "bg-brand-soft text-brand" : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100"}`}
                          title={collapsed ? item.label : undefined}
                        >
                          <Icon size={15} className={isActive ? "text-brand" : "text-gray-400 dark:text-slate-500"} />
                          {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                          {!collapsed && <ChevronDown size={13} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />}
                        </button>
                        {!collapsed && isOpen && (
                          <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-gray-100 dark:border-slate-700 pl-2.5">
                            {item.children.map((child) => {
                              const childActive = child.href === activeHref;
                              return (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    className={`block rounded px-2.5 py-1.5 text-xs font-medium transition-colors
                                      ${childActive ? "bg-brand-soft text-brand" : "text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-800 dark:hover:text-slate-200"}`}
                                  >
                                    {child.label}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  }

                  const isActive = item.href === activeHref;
                  const badgeValue = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors
                          ${isActive
                            ? "bg-brand-soft text-brand"
                            : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100"
                          }`}
                      >
                        <Icon size={15} className={isActive ? "text-brand" : "text-gray-400 dark:text-slate-500"} />
                        {!collapsed && <span className="flex-1">{item.label}</span>}
                        {!collapsed && badgeValue > 0 && (
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
          aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          className="mx-2.5 mb-2 flex h-7 items-center justify-center rounded border border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 transition hover:bg-gray-50 dark:hover:bg-slate-800"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        {/* User section */}
        <div className="border-t border-[#E5EAF0] dark:border-slate-700 p-2.5">
          <div ref={menuRef} className="relative">
            <div className="flex items-center gap-2.5 rounded bg-gray-50 dark:bg-slate-800 px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold uppercase text-white">
                {user?.display_name?.[0] ?? "?"}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">
                    {user ? ROLE_LABELS[user.role] : "—"}
                  </p>
                  <p className="truncate text-xs font-medium text-gray-900 dark:text-slate-100">
                    {user?.display_name ?? "—"}
                  </p>
                </div>
              )}
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 dark:text-slate-500 transition hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-300"
                  aria-label="Tuỳ chọn tài khoản"
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
                  Đăng xuất
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
