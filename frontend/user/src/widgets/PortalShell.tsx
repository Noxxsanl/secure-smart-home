"use client";

import ShellFrame from "@smarthome/shared/app-shell/ShellFrame";
import NotificationBell from "@smarthome/shared/app-shell/NotificationBell";
import { POLL_NOTIFICATIONS_MS } from "@/lib/api/client";
import { useHomeOverview } from "@/lib/api/homes";
import HomeSwitcher from "@/features/home/components/HomeSwitcher";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import { useHomeNotifications } from "@/features/notifications/hooks/useHomeNotifications";
import { NAV_SECTIONS, ROUTE_LABELS } from "@/config/nav";
import { PORTAL } from "@/config/portal";

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const { current, permissions } = useCurrentHome();
  const { notifications, unreadCount, markRead, markAllRead } = useHomeNotifications();
  // Số gợi ý tự động hoá đang chờ lấy từ overview (GUEST không có quyền xem gợi ý nên không có huy hiệu).
  const { data: overview } = useHomeOverview(current?.home.id ?? null, POLL_NOTIFICATIONS_MS);

  return (
    <ShellFrame
      brandName={PORTAL.name}
      sections={NAV_SECTIONS}
      routeLabels={ROUTE_LABELS}
      badges={{
        unreadNotifications: unreadCount,
        pendingSuggestions: permissions?.canViewAutomation ? (overview?.pending_suggestions ?? 0) : 0,
      }}
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
