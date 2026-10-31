"use client";

import { NotificationBell, ShellFrame } from "@shh/ui";
import { HomeSwitcher, ROLE_LABELS, useAuth } from "@shh/auth";
import { usePendingSuggestionCount } from "@shh/automation";
import { useHomeNotifications } from "@shh/notifications";
import { NAV_SECTIONS, ROUTE_LABELS } from "@/config/nav";
import { PORTAL } from "@/config/portal";

// Khung cổng khách: chọn nhà (@shh/auth), chuông thông báo theo nhà (@shh/notifications),
// huy hiệu gợi ý tự động hoá đang chờ (@shh/automation).
export default function PortalShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useHomeNotifications();
  const pendingSuggestions = usePendingSuggestionCount();

  return (
    <ShellFrame
      brandName={PORTAL.name}
      sections={NAV_SECTIONS}
      routeLabels={ROUTE_LABELS}
      badges={{ unreadNotifications: unreadCount, pendingSuggestions }}
      account={user ? { displayName: user.display_name, roleLabel: ROLE_LABELS[user.role] } : null}
      onLogout={() => void logout()}
      headerActions={
        <>
          <HomeSwitcher />
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            viewAllHref="/notifications"
          />
        </>
      }
    >
      {children}
    </ShellFrame>
  );
}
