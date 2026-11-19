"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function buildCrumbs(pathname: string, labels: Record<string, string>) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];

  let path = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    path += `/${segment}`;
    const isLastDynamic = i === segments.length - 1 && !labels[segment];
    crumbs.push({
      label: isLastDynamic ? "Chi tiết" : (labels[segment] ?? segment),
      href: path,
    });
  }

  return crumbs;
}

export default function Breadcrumb({ labels }: { labels: Record<string, string> }) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname, labels);

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
