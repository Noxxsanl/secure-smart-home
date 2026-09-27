import {
  LayoutDashboard, Home, UserCircle, QrCode, Server, Cpu, UploadCloud,
  Zap, Bell, ShieldAlert, BrainCircuit,
} from "lucide-react";
import type { NavSection } from "@smarthome/shared/app-shell/types";
import { logNavChildren } from "@smarthome/console/logs/config";

// Sidebar OPERATOR — docs/05 §5.3: không có "Quản trị hệ thống" (Team, Operator
// Access, Settings) và chỉ 5 loại log vận hành.
export const NAV_SECTIONS: NavSection[] = [
  {
    section: "Tổng quan",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    section: "Hỗ trợ khách hàng",
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
    section: "Giám sát",
    items: [
      { label: "Notification Center", href: "/notifications", icon: Bell, badgeKey: "unreadNotifications" },
      { label: "Logs", icon: ShieldAlert, children: logNavChildren("operator") },
    ],
  },
  {
    section: "Trí tuệ nhân tạo",
    items: [
      { label: "AI Dashboard", href: "/ai-dashboard", icon: BrainCircuit },
    ],
  },
];

export const ROUTE_LABELS: Record<string, string> = {};
