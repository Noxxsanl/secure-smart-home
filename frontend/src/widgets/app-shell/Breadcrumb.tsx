"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  devices: "Devices",
  audit: "Audit Log",
  users: "Users",
  logs: "Logs",
  new: "New",
};

function buildCrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];

  let path = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    path += `/${segment}`;
    const isLastDynamic = i === segments.length - 1 && !ROUTE_LABELS[segment];
    crumbs.push({
      label: isLastDynamic ? "Detail" : (ROUTE_LABELS[segment] ?? segment),
      href: path,
    });
  }

  return crumbs;
}

export default function Breadcrumb() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2.5 text-base">
      {crumbs.map((crumb, index) => (
        <span key={crumb.href} className="flex items-center gap-2.5">
          {index > 0 && <span className="text-gray-300 dark:text-slate-600">/</span>}
          {index === crumbs.length - 1 ? (
            <span className="font-semibold text-gray-900 dark:text-slate-100">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-gray-400 dark:text-slate-500 transition-colors hover:text-gray-700 dark:hover:text-slate-300"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
