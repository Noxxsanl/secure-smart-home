"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from "./constants";
import type { NavSection, ShellAccount } from "./types";

type ShellFrameProps = {
  sections: NavSection[];
  badges?: Record<string, number>;
  brandName: string;
  routeLabels: Record<string, string>;
  headerActions?: React.ReactNode;
  account: ShellAccount | null;
  onLogout: () => void;
  children: React.ReactNode;
};

export default function ShellFrame({
  sections, badges, brandName, routeLabels, headerActions, account, onLogout, children,
}: ShellFrameProps) {
  const [collapsed, setCollapsed] = useState(false);
  const marginLeft = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <div className="bg-canvas dark:bg-slate-900 text-gray-900 dark:text-slate-100">
      <Sidebar
        sections={sections}
        badges={badges}
        brandName={brandName}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        account={account}
        onLogout={onLogout}
      />
      <div className="flex h-screen flex-col overflow-hidden transition-all" style={{ marginLeft }}>
        <Header routeLabels={routeLabels} actions={headerActions} />
        <main className="flex-1 overflow-y-auto bg-canvas dark:bg-slate-900 px-5 py-4 sm:px-6 lg:px-7">
          {children}
        </main>
      </div>
    </div>
  );
}
