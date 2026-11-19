"use client";

import { NotificationBell, ShellFrame } from "@shh/ui";
import { ROLE_LABELS, useAuth } from "@shh/auth";
import { useNotifications } from "@shh/notifications";
import { useConsoleBadges } from "@shh/stats";
import { NAV_SECTIONS, ROUTE_LABELS } from "@/config/nav";
import { PORTAL } from "@/config/portal";

// Khung console: sidebar theo nav của app, huy hiệu (@shh/stats), chuông thông báo
// (@shh/notifications). Nav config chứa component icon (hàm) nên phải truyền từ client component.
export default function PortalShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const badges = useConsoleBadges(unreadCount);

  return (
    <ShellFrame
      brandName={PORTAL.name}
      sections={NAV_SECTIONS}
      badges={badges}
      routeLabels={ROUTE_LABELS}
      account={user ? { displayName: user.display_name, roleLabel: ROLE_LABELS[user.role] } : null}
      onLogout={() => void logout()}
      headerActions={
        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkRead={(id) => void markRead(id)}
          onMarkAllRead={() => void markAllRead()}
          viewAllHref="/notifications"
        />
      }
    >
      {children}
    </ShellFrame>
  );
}
