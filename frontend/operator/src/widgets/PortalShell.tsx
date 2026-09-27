"use client";

import ConsoleShell from "@smarthome/console/shell/ConsoleShell";
import { NAV_SECTIONS, ROUTE_LABELS } from "@/config/nav";
import { PORTAL } from "@/config/portal";

// Nav config chứa component icon (hàm) nên phải truyền từ một client component.
export default function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleShell brandName={PORTAL.name} sections={NAV_SECTIONS} extraRouteLabels={ROUTE_LABELS}>
      {children}
    </ConsoleShell>
  );
}
