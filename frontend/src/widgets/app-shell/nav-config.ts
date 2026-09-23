import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Home, UserCircle, QrCode, Server, Cpu, UploadCloud,
  Zap, Bell, ShieldAlert, Users, KeyRound, Settings, Radio, Fingerprint,
  Activity, Workflow, AlertOctagon, BrainCircuit,
} from "lucide-react";
import type { LogCategory } from "@/shared/mock/types";

export type NavRole = "admin" | "operator";
export type BadgeKey = "unclaimedHomes" | "offlineGateways" | "otaInProgress" | "unreadNotifications";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: NavRole[];
  badgeKey?: BadgeKey;
};

export type NavSection = {
  section: string;
  items: NavItem[];
};

export const LOG_CATEGORY_CONFIG: { category: LogCategory; label: string; roles: NavRole[] }[] = [
  { category: "gateway",    label: "Gateway Log",        roles: ["admin", "operator"] },
  { category: "device",     label: "Device Log",         roles: ["admin", "operator"] },
  { category: "provision",  label: "Provision Log",      roles: ["admin", "operator"] },
  { category: "mqtt",       label: "MQTT Log",           roles: ["admin"] },
  { category: "security",   label: "Security Log",       roles: ["admin"] },
  { category: "auth",       label: "Authentication Log", roles: ["admin"] },
  { category: "activity",   label: "User Activity Log",  roles: ["admin"] },
  { category: "automation", label: "Automation Log",     roles: ["admin", "operator"] },
  { category: "ota",        label: "OTA Log",             roles: ["admin", "operator"] },
  { category: "error",      label: "Error Log",           roles: ["admin"] },
];

export const NAV_SECTIONS: NavSection[] = [
  {
    section: "Tổng quan",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "operator"] },
    ],
  },
  {
    section: "Kinh doanh",
    items: [
      { label: "Smart Homes", href: "/smart-homes", icon: Home, roles: ["admin", "operator"], badgeKey: "unclaimedHomes" },
      { label: "Customers", href: "/customers", icon: UserCircle, roles: ["admin", "operator"] },
      { label: "Provisioning", href: "/smart-homes/new", icon: QrCode, roles: ["admin", "operator"] },
    ],
  },
  {
    section: "Hạ tầng thiết bị",
    items: [
      { label: "Gateways", href: "/gateways", icon: Server, roles: ["admin", "operator"], badgeKey: "offlineGateways" },
      { label: "Devices", href: "/devices", icon: Cpu, roles: ["admin", "operator"] },
      { label: "OTA & Firmware", href: "/ota", icon: UploadCloud, roles: ["admin", "operator"], badgeKey: "otaInProgress" },
    ],
  },
  {
    section: "Tự động hoá",
    items: [
      { label: "Automation Rules", href: "/automation", icon: Zap, roles: ["admin", "operator"] },
    ],
  },
  {
    section: "Giám sát & Nhật ký",
    items: [
      { label: "Notification Center", href: "/notifications", icon: Bell, roles: ["admin", "operator"], badgeKey: "unreadNotifications" },
      { label: "Logs", href: "/logs/gateway", icon: ShieldAlert, roles: ["admin", "operator"] },
    ],
  },
  {
    section: "Trí tuệ nhân tạo",
    items: [
      { label: "AI Dashboard", href: "/ai-dashboard", icon: BrainCircuit, roles: ["admin", "operator"] },
    ],
  },
  {
    section: "Quản trị hệ thống",
    items: [
      { label: "Team & Roles", href: "/team", icon: Users, roles: ["admin"] },
      { label: "Operator Access", href: "/team/access", icon: KeyRound, roles: ["admin"] },
      { label: "Settings", href: "/settings", icon: Settings, roles: ["admin"] },
    ],
  },
];

// Small helper icons reused by Logs Center / category chips, exported so the
// Logs feature doesn't re-import a different icon for the same concept.
export const LOG_CATEGORY_ICONS: Record<LogCategory, LucideIcon> = {
  gateway: Server, device: Cpu, provision: QrCode, mqtt: Radio, security: ShieldAlert,
  auth: Fingerprint, activity: Activity, automation: Workflow, ota: UploadCloud, error: AlertOctagon,
};
