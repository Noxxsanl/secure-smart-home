"use client";

import ShellFrame from "@smarthome/shared/app-shell/ShellFrame";
import NotificationBell from "@smarthome/shared/app-shell/NotificationBell";
import type { NavSection } from "@smarthome/shared/app-shell/types";
import { useDashboardSWR } from "@smarthome/console/api/client";
import { badgesKey } from "@smarthome/console/api/stats.api";
import type { ConsoleBadges } from "@smarthome/console/api/types";
import { useNotifications } from "@smarthome/console/notifications/hooks/useNotifications";

// Badge keys dùng trong nav config của app admin/operator.
export type ConsoleBadgeKey = "unclaimedHomes" | "offlineGateways" | "otaInProgress" | "unreadNotifications";

// Nhãn breadcrumb cho các route console dùng chung; app truyền thêm route riêng.
export const CONSOLE_ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  "ai-dashboard": "AI Dashboard",
  devices: "Devices",
  logs: "Logs",
  new: "Provisioning",
  "smart-homes": "Smart Homes",
  customers: "Customers",
  gateways: "Gateways",
  automation: "Automation",
  ota: "OTA & Firmware",
  notifications: "Notification Center",
  gateway: "Gateway Log",
  device: "Device Log",
  provision: "Provision Log",
  mqtt: "MQTT Log",
  security: "Security Log",
  auth: "Authentication Log",
  activity: "User Activity Log",
  error: "Error Log",
};

type ConsoleShellProps = {
  brandName: string;
  sections: NavSection[];
  extraRouteLabels?: Record<string, string>;
  children: React.ReactNode;
};

export default function ConsoleShell({ brandName, sections, extraRouteLabels, children }: ConsoleShellProps) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  // GET /stats/badges — poll 15 s; lỗi tạm thời giữ số cũ (keepPreviousData).
  const { data: stats } = useDashboardSWR<ConsoleBadges>(badgesKey(), {
    refreshInterval: 15_000,
    keepPreviousData: true,
  });

  const badges: Record<ConsoleBadgeKey, number> = {
    unclaimedHomes: stats?.unclaimed_homes ?? 0,
    offlineGateways: stats?.offline_gateways ?? 0,
    otaInProgress: stats?.ota_in_progress ?? 0,
    // Chuông và badge cùng nguồn đếm; ưu tiên số của danh sách thông báo (cập nhật ngay khi đánh dấu đã đọc).
    unreadNotifications: unreadCount || stats?.unread_notifications || 0,
  };

  return (
    <ShellFrame
      brandName={brandName}
      sections={sections}
      badges={badges}
      routeLabels={{ ...CONSOLE_ROUTE_LABELS, ...extraRouteLabels }}
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
