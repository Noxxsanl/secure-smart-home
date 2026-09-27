import {
  LayoutDashboard, Home, UserCircle, QrCode, Server, Cpu, UploadCloud,
  Zap, Bell, ShieldAlert, Users, KeyRound, Settings, BrainCircuit,
} from "lucide-react";
import type { NavSection } from "@smarthome/shared/app-shell/types";
import { logNavChildren } from "@smarthome/console/logs/config";

// Sidebar ADMIN — docs/05 §5.2.
export const NAV_SECTIONS: NavSection[] = [
  {
    section: "Tổng quan",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    section: "Kinh doanh",
    items: [
      { label: "Smart Homes", href: "/smart-homes", icon: Home, badgeKey: "unclaimedHomes" },
      { label: "Customers", href: "/customers", icon: UserCircle },
      { label: "Provisioning", href: "/smart-homes/new", icon: QrCode },
    ],
  },
  {
    section: "Hạ tầng thiết bị",
    items: [
      { label: "Gateways", href: "/gateways", icon: Server, badgeKey: "offlineGateways" },
      { label: "Devices", href: "/devices", icon: Cpu },
      { label: "OTA & Firmware", href: "/ota", icon: UploadCloud, badgeKey: "otaInProgress" },
    ],
  },
  {
    section: "Tự động hoá",
    items: [
      { label: "Automation Rules", href: "/automation", icon: Zap },
    ],
  },
  {
    section: "Giám sát & Nhật ký",
    items: [
      { label: "Notification Center", href: "/notifications", icon: Bell, badgeKey: "unreadNotifications" },
      { label: "Logs", icon: ShieldAlert, children: logNavChildren("admin") },
    ],
  },
  {
    section: "Trí tuệ nhân tạo",
    items: [
      { label: "AI Dashboard", href: "/ai-dashboard", icon: BrainCircuit },
    ],
  },
  {
    section: "Quản trị hệ thống",
    items: [
      { label: "Team & Roles", href: "/team", icon: Users },
      { label: "Operator Access", href: "/team/access", icon: KeyRound },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export const ROUTE_LABELS: Record<string, string> = {
  team: "Team & Roles",
  access: "Operator Access",
  settings: "Settings",
};
