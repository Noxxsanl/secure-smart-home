export const SIDEBAR_WIDTH = 240;

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { href: "/devices",   label: "Devices",   icon: "cpu"              },
  { href: "/users",     label: "Users",     icon: "users"            },
  { href: "/audit",     label: "Audit",     icon: "file-text"        },
  { href: "/logs",      label: "Logs",      icon: "terminal"         },
] as const;
