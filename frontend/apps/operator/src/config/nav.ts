import {
  LayoutDashboard, Home, UserCircle, QrCode, Server, Cpu, UploadCloud,
  Zap, Bell, ShieldAlert, BrainCircuit,
} from "lucide-react";
import type { NavSection } from "@shh/ui";
import { logNavChildren } from "@shh/audit";

// Sidebar OPERATOR — docs/architecture/FRONTEND_REFACTOR_SMARTHOME.md §5.3: không có "Quản trị hệ thống" (Team, Operator
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

// Nhãn breadcrumb cho các route console dùng chung (admin + operator).
const CONSOLE_ROUTE_LABELS: Record<string, string> = {
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

export const ROUTE_LABELS: Record<string, string> = CONSOLE_ROUTE_LABELS;
