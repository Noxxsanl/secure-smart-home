"use client";

import Breadcrumb from "@smarthome/shared/app-shell/Breadcrumb";
import { ThemeToggle } from "@smarthome/shared/ui/ThemeToggle";

type HeaderProps = {
  routeLabels: Record<string, string>;
  // Nút riêng của từng app (chuông thông báo, chọn nhà, ...), đặt cạnh nút theme.
  actions?: React.ReactNode;
};

export default function Header({ routeLabels, actions }: HeaderProps) {
  return (
    <header className="flex h-20 shrink-0 items-center justify-between border-b border-[#E5EAF0] dark:border-slate-700 bg-[#F8F9FB] dark:bg-slate-900 px-6">
      <Breadcrumb labels={routeLabels} />

      <div className="flex items-center gap-4">
        <ThemeToggle />
        {actions}
      </div>
    </header>
  );
}
