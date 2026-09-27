"use client";

import ShellFrame from "@smarthome/shared/app-shell/ShellFrame";
import NotificationBell from "@smarthome/shared/app-shell/NotificationBell";
import { listSuggestions } from "@smarthome/shared/mock/portal";
import HomeSwitcher from "@/features/home/components/HomeSwitcher";
import { useHomeNotifications } from "@/features/notifications/hooks/useHomeNotifications";
import { useHomeQuery } from "@/lib/portal-swr";
import { NAV_SECTIONS, ROUTE_LABELS } from "@/config/nav";
import { PORTAL } from "@/config/portal";

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const { notifications, unreadCount, markRead, markAllRead } = useHomeNotifications();
  const { data: suggestions } = useHomeQuery("suggestions", listSuggestions);

  return (
    <ShellFrame
      brandName={PORTAL.name}
      sections={NAV_SECTIONS}
      routeLabels={ROUTE_LABELS}
      badges={{
        unreadNotifications: unreadCount,
        pendingSuggestions: suggestions?.filter((s) => s.status === "pending").length ?? 0,
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
