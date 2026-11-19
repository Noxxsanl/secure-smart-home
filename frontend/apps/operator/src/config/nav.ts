import {
  LayoutDashboard, Home, UserCircle, CirclePlus, Server, Cpu, UploadCloud, Bell, BrainCircuit, ShieldAlert,
} from "lucide-react";
import type { NavSection } from "@shh/ui";
import { logNavChildren } from "@shh/audit";

// Sidebar OPERATOR — bản cơ bản (2026-11-13): như Admin nhưng không có "Quản trị hệ thống" (Team, Operator Access) và
// chỉ 5 loại log vận hành. Đã gỡ các trang mock / chưa dùng tới: Provisioning KIT mô phỏng, Automation
// Rules, AI Dashboard.
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
      { label: "Customers", href: "/customers", icon: UserCircle },
      { label: "Smart Homes", href: "/smart-homes", icon: Home },
    ],
  },
  {
    section: "Thiết bị",
    items: [
      { label: "Đăng ký Gateway", href: "/gateways/register", icon: CirclePlus },
      { label: "Gateways", href: "/gateways", icon: Server, badgeKey: "offlineGateways" },
      { label: "Devices", href: "/devices", icon: Cpu },
      { label: "OTA & Firmware", href: "/ota", icon: UploadCloud, badgeKey: "otaInProgress" },
    ],
  },
  {
    section: "Trí tuệ nhân tạo",
    items: [
      { label: "AI Usage", href: "/ai-usage", icon: BrainCircuit },
    ],
  },
  {
    section: "Giám sát",
    items: [
      { label: "Notification Center", href: "/notifications", icon: Bell, badgeKey: "unreadNotifications" },
      { label: "Logs", icon: ShieldAlert, children: logNavChildren("operator") },
    ],
  },
];

// Nhãn breadcrumb cho các route console dùng chung (admin + operator).
const CONSOLE_ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  devices: "Devices",
  logs: "Logs",
  register: "Đăng ký Gateway",
  "smart-homes": "Smart Homes",
  customers: "Customers",
  gateways: "Gateways",
  ota: "OTA & Firmware",
  "ai-usage": "AI Usage",
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
