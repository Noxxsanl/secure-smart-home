"use client";

import { useState } from "react";
import Sidebar from "@/widgets/app-shell/Sidebar";
import Header from "@/widgets/app-shell/Header";
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from "@/widgets/app-shell/constants";

export default function ShellFrame({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const marginLeft = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <div className="bg-canvas dark:bg-slate-900 text-gray-900 dark:text-slate-100">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
      <div className="flex h-screen flex-col overflow-hidden transition-all" style={{ marginLeft }}>
        <Header />
        <main className="flex-1 overflow-y-auto bg-canvas dark:bg-slate-900 px-5 py-4 sm:px-6 lg:px-7">
          {children}
        </main>
      </div>
    </div>
  );
}
