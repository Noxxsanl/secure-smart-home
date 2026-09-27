"use client";

import { useMemo } from "react";
import ShellFrame from "@smarthome/shared/app-shell/ShellFrame";
import NotificationBell from "@smarthome/shared/app-shell/NotificationBell";
import type { NavSection } from "@smarthome/shared/app-shell/types";
import { smartHomeStore, gatewayStore, firmwareStore } from "@smarthome/shared/mock/store";
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

  const staticBadges = useMemo(() => ({
    unclaimedHomes: smartHomeStore.list().filter((h) => h.status === "unclaimed").length,
    offlineGateways: gatewayStore.list().filter((g) => g.status === "offline").length,
    otaInProgress: firmwareStore.listDeployments().filter((d) => d.status === "in_progress").length,
  }), []);

  const badges: Record<ConsoleBadgeKey, number> = { ...staticBadges, unreadNotifications: unreadCount };

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
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
          viewAllHref="/notifications"
        />
      }
    >
      {children}
    </ShellFrame>
  );
}
