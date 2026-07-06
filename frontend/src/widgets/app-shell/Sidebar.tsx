"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Cpu, Shield, Users, Wifi, MoreVertical, LogOut } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";

const NAV_LINKS = [
  { label: "Dashboard",   href: "/dashboard", icon: LayoutDashboard },
  { label: "Thiết bị",   href: "/devices",   icon: Cpu },
  { label: "Audit Log",  href: "/audit",     icon: Shield },
  { label: "Người dùng", href: "/users",     icon: Users },
];

const ROLE_LABELS: Record<string, string> = {
  admin:    "Quản trị viên",
  operator: "Vận hành",
};

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const [menuOpen, setMenuOpen]       = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-900">

        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-[#E5EAF0] dark:border-slate-700 px-4 py-3.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-white">
            <Wifi size={14} />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Smart Home</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5">
          <ul className="space-y-0.5">
            {NAV_LINKS.map(({ label, href, icon: Icon }) => {
              const isActive =
                pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors
                      ${isActive
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                        : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100"
                      }`}
                  >
                    <Icon size={15} className={isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="border-t border-[#E5EAF0] dark:border-slate-700 p-2.5">
          <div ref={menuRef} className="relative">
            <div className="flex items-center gap-2.5 rounded bg-gray-50 dark:bg-slate-800 px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold uppercase text-white">
                {user?.username?.[0] ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">
                  {user?.role ? (ROLE_LABELS[user.role] ?? user.role) : "—"}
                </p>
                <p className="truncate text-xs font-medium text-gray-900 dark:text-slate-100">
                  {user?.username ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 dark:text-slate-500 transition hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-300"
                aria-label="More options"
              >
                <MoreVertical size={13} />
              </button>
            </div>

            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-md">
                <div className="my-1 border-t border-[#E5EAF0] dark:border-slate-700" />
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/20"
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
