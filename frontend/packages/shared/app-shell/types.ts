import type { LucideIcon } from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  // Khoá tra trong `badges` truyền vào ShellFrame; 0/undefined thì không hiện.
  badgeKey?: string;
};

// Mục có menu con (VD: Logs → Gateway Log, Device Log, ...).
export type NavGroup = {
  label: string;
  icon: LucideIcon;
  children: { label: string; href: string }[];
};

export type NavItem = NavLink | NavGroup;

export type NavSection = {
  section: string;
  items: NavItem[];
};

export function isNavGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}
