import {
  LayoutDashboard, DoorClosed, Lightbulb, Zap, Bell, Users, QrCode, UserCircle,
} from "lucide-react";
import type { NavSection } from "@smarthome/shared/app-shell/types";

export const NAV_SECTIONS: NavSection[] = [
  {
    section: "Nhà của tôi",
    items: [
      { label: "Tổng quan", href: "/home", icon: LayoutDashboard },
      { label: "Phòng", href: "/rooms", icon: DoorClosed },
      { label: "Thiết bị", href: "/devices", icon: Lightbulb },
    ],
  },
  {
    section: "Tiện ích",
    items: [
      { label: "Tự động hoá", href: "/automation", icon: Zap, badgeKey: "pendingSuggestions" },
      { label: "Thông báo", href: "/notifications", icon: Bell, badgeKey: "unreadNotifications" },
    ],
  },
  {
    section: "Gia đình",
    items: [
      { label: "Thành viên", href: "/members", icon: Users },
      { label: "Thêm Smart Home", href: "/claim", icon: QrCode },
    ],
  },
  {
    section: "Tài khoản",
    items: [
      { label: "Hồ sơ", href: "/profile", icon: UserCircle },
    ],
  },
];

export const ROUTE_LABELS: Record<string, string> = {
  home: "Tổng quan",
  rooms: "Phòng",
  devices: "Thiết bị",
  automation: "Tự động hoá",
  notifications: "Thông báo",
  members: "Thành viên",
  claim: "Thêm Smart Home",
  profile: "Hồ sơ",
};
