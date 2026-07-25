"use client";

import Link from "next/link";
import { UserCircle, Home, Server, Cpu, AlertTriangle, Activity } from "lucide-react";
import StatsCard from "@/features/dashboard/components/StatsCard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useAdminDashboard } from "@/features/dashboard/hooks/useAdminDashboard";
import StatusBadge from "@/shared/ui/StatusBadge";
import SeverityBadge from "@/shared/ui/SeverityBadge";
import ProgressBar from "@/shared/ui/ProgressBar";
import { firmwareStore } from "@/shared/mock/store";

const SYSTEM_HEALTH = [
  { label: "MQTT Broker 1", status: "online" as const },
  { label: "MQTT Broker 2", status: "online" as const },
  { label: "MySQL", status: "online" as const },
  { label: "Redis", status: "online" as const },
];

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { stats, isLoading } = useAdminDashboard();
  const firmwareVersions = firmwareStore.list();

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
          Xin chào, {user?.username ?? "Admin"}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Tổng quan nền tảng — business metrics và system health.
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatsCard title="Customers" value={isLoading ? "—" : stats?.totalCustomers ?? 0}
          subtitle="Khách hàng đã đăng ký."
          accent="bg-brand-soft text-brand" iconBg="bg-brand-soft"
          icon={<UserCircle className="h-4 w-4 text-brand" />} />
        <StatsCard title="Smart Homes" value={isLoading ? "—" : stats?.totalSmartHomes ?? 0}
          subtitle={`${stats?.unclaimedHomes ?? 0} chờ kích hoạt.`}
          accent="bg-brand-soft text-brand" iconBg="bg-brand-soft"
          icon={<Home className="h-4 w-4 text-brand" />} />
        <StatsCard title="Gateway Online" value={isLoading ? "—" : `${stats?.gatewaysOnline ?? 0}/${stats?.gatewaysTotal ?? 0}`}
          subtitle="Gateway đang kết nối / tổng số."
          accent="bg-success-soft text-success" iconBg="bg-success-soft"
          icon={<Server className="h-4 w-4 text-success" />} />
        <StatsCard title="Device Online" value={isLoading ? "—" : `${stats?.devicesOnline ?? 0}/${stats?.devicesTotal ?? 0}`}
          subtitle="Thiết bị đang hoạt động / tổng số."
          accent="bg-success-soft text-success" iconBg="bg-success-soft"
          icon={<Cpu className="h-4 w-4 text-success" />} />
        <StatsCard title="Open Alerts" value={isLoading ? "—" : stats?.openAlerts ?? 0}
          subtitle="Cảnh báo mức Critical cần xử lý."
          accent="bg-critical-soft text-critical" iconBg="bg-critical-soft"
          icon={<AlertTriangle className="h-4 w-4 text-critical" />} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* System Health */}
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">System Health</p>
          <div className="mt-3 space-y-2">
            {SYSTEM_HEALTH.map((s) => (
              <div key={s.label} className="flex items-center justify-between rounded border border-gray-100 dark:border-slate-700 px-3 py-2">
                <span className="text-sm text-gray-700 dark:text-slate-300">{s.label}</span>
                <StatusBadge status={s.status} />
              </div>
            ))}
            <div className="flex items-center justify-between rounded border border-gray-100 dark:border-slate-700 px-3 py-2">
              <span className="text-sm text-gray-700 dark:text-slate-300">API Latency p95</span>
              <span className="font-mono text-sm font-semibold text-gray-900 dark:text-slate-100">128ms</span>
            </div>
          </div>
        </div>

        {/* Top Errors */}
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Top Errors (gần đây)</p>
            <Link href="/logs/error" className="text-xs font-medium text-brand hover:brightness-90">Xem tất cả</Link>
          </div>
          <div className="mt-3 space-y-2">
            {(stats?.topErrors ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500">Không có lỗi nào gần đây.</p>
            ) : (
              stats!.topErrors.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded border border-gray-100 dark:border-slate-700 px-3 py-2">
                  <span className="truncate text-sm text-gray-700 dark:text-slate-300">{e.message}</span>
                  <SeverityBadge severity={e.severity} showIcon={false} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Firmware Rollout */}
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Firmware Rollout</p>
            <Link href="/ota" className="text-xs font-medium text-brand hover:brightness-90">Quản lý OTA</Link>
          </div>
          <div className="mt-3 space-y-3">
            {(stats?.firmwareRollouts ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500">Không có rollout nào đang chạy.</p>
            ) : (
              stats!.firmwareRollouts.map((d) => {
                const fw = firmwareVersions.find((f) => f.id === d.firmware_id);
                return (
                  <div key={d.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-slate-300">
                        {fw ? `${fw.type === "gateway" ? "Gateway" : "Node"} FW ${fw.version}` : `Firmware #${d.firmware_id}`}
                      </span>
                      <span className="font-mono text-xs text-gray-400 dark:text-slate-500">{d.progress_percent}%</span>
                    </div>
                    <ProgressBar percent={d.progress_percent} colorClassName="bg-brand" />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Activities */}
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Recent Activities</p>
          <div className="mt-3 space-y-2">
            {(stats?.recentActivity ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500">Chưa có hoạt động nào.</p>
            ) : (
              stats!.recentActivity.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-slate-600" />
                  <span className="text-gray-600 dark:text-slate-400">{a.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
