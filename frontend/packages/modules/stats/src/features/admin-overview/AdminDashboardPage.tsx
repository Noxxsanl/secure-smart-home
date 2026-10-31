"use client";

import { logCategoryLabel, ACTIVATION_METHOD_LABELS, ACTIVATION_REASON_LABELS } from "@shh/api-client/dashboard";
import Link from "next/link";
import { UserCircle, Home, Server, Cpu, AlertTriangle, Activity } from "lucide-react";
import { StatsCard, StatusBadge, SeverityBadge, ProgressBar, Panel, PanelEmpty, LoadErrorBar } from "@shh/ui";
import { useAuth } from "@shh/auth";
import { formatDateTime, formatRelative } from "@shh/utils";
import { useAdminDashboard } from "../../api/useAdminDashboard";

type HomeSegment = { key: "active" | "unclaimed" | "suspended"; label: string; barClass: string; textClass: string };

const HOME_SEGMENTS: HomeSegment[] = [
  { key: "active", label: "Đang hoạt động", barClass: "bg-success", textClass: "text-success" },
  { key: "unclaimed", label: "Chờ kích hoạt", barClass: "bg-warning", textClass: "text-warning" },
  { key: "suspended", label: "Tạm ngưng", barClass: "bg-critical", textClass: "text-critical" },
];

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { stats, isLoading, error, refresh } = useAdminDashboard();
  const placeholder = isLoading && !stats;

  const homeCounts = {
    active: stats?.active_homes ?? 0,
    unclaimed: stats?.unclaimed_homes ?? 0,
    suspended: stats?.suspended_homes ?? 0,
  };
  const homeTotal = stats?.total_smart_homes ?? 0;

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
          Xin chào, {user?.display_name ?? user?.username ?? "Admin"}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Tổng quan nền tảng — Smart Home theo trạng thái, hạ tầng thiết bị, cảnh báo và kích hoạt gần đây.
        </p>
      </div>

      {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

      {/* KPI Row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatsCard title="Customers" value={placeholder ? "—" : stats?.total_customers ?? 0}
          subtitle="Khách hàng đã đăng ký."
          accent="bg-brand-soft text-brand" iconBg="bg-brand-soft"
          icon={<UserCircle className="h-4 w-4 text-brand" />} />
        <StatsCard title="Smart Homes" value={placeholder ? "—" : homeTotal}
          subtitle={`${homeCounts.unclaimed} chờ kích hoạt · ${homeCounts.suspended} tạm ngưng.`}
          accent="bg-brand-soft text-brand" iconBg="bg-brand-soft"
          icon={<Home className="h-4 w-4 text-brand" />} />
        <StatsCard title="Gateway Online" value={placeholder ? "—" : `${stats?.gateways_online ?? 0}/${stats?.gateways_total ?? 0}`}
          subtitle="Gateway đang kết nối / tổng số."
          accent="bg-success-soft text-success" iconBg="bg-success-soft"
          icon={<Server className="h-4 w-4 text-success" />} />
        <StatsCard title="Device Online" value={placeholder ? "—" : `${stats?.devices_online ?? 0}/${stats?.devices_total ?? 0}`}
          subtitle="Thiết bị đang hoạt động / tổng số."
          accent="bg-success-soft text-success" iconBg="bg-success-soft"
          icon={<Cpu className="h-4 w-4 text-success" />} />
        <StatsCard title="Open Alerts" value={placeholder ? "—" : stats?.open_alerts ?? 0}
          subtitle="Cảnh báo Critical trong 24 giờ qua."
          accent="bg-critical-soft text-critical" iconBg="bg-critical-soft"
          icon={<AlertTriangle className="h-4 w-4 text-critical" />} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* Smart Home theo trạng thái (FR-11.1) */}
        <Panel
          title="Smart Home theo trạng thái"
          action={<Link href="/smart-homes" className="text-xs font-medium text-brand hover:brightness-90">Xem danh sách</Link>}
        >
          <div className="space-y-3 p-4">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700" role="img"
              aria-label={`${homeCounts.active} đang hoạt động, ${homeCounts.unclaimed} chờ kích hoạt, ${homeCounts.suspended} tạm ngưng`}>
              {homeTotal > 0 && HOME_SEGMENTS.map((s) => (
                <div key={s.key} className={s.barClass} style={{ width: `${(homeCounts[s.key] / homeTotal) * 100}%` }} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {HOME_SEGMENTS.map((s) => (
                <div key={s.key} className="rounded border border-gray-100 dark:border-slate-700 px-3 py-2">
                  <p className={`text-xl font-semibold ${s.textClass}`}>{placeholder ? "—" : homeCounts[s.key]}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Kích hoạt gần đây (FR-11.1) */}
        <Panel
          title="Kích hoạt gần đây"
          subtitle="Lượt quét QR / nhập mã / Operator gán."
          action={<Link href="/logs/provision" className="text-xs font-medium text-brand hover:brightness-90">Provision Log</Link>}
        >
          {(stats?.recent_activations ?? []).length === 0 ? (
            <PanelEmpty>Chưa có lượt kích hoạt nào.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {stats!.recent_activations.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">
                      {a.home_id && a.home_name ? (
                        <Link href={`/smart-homes/${a.home_id}`} className="hover:text-brand">{a.home_name}</Link>
                      ) : "Mã không gắn với nhà nào"}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                      {a.customer_name ?? "Khách hàng chưa xác định"} · {ACTIVATION_METHOD_LABELS[a.method] ?? "Phương thức khác"}
                      {a.result === "failed" && ` · ${(a.reason && ACTIVATION_REASON_LABELS[a.reason]) ?? "Không rõ lý do"}`}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-slate-500" title={formatDateTime(a.activated_at)}>
                      {formatRelative(a.activated_at, "—")}
                    </p>
                  </div>
                  <StatusBadge status={a.result === "success" ? "active" : "blocked"} label={a.result === "success" ? "Thành công" : "Thất bại"} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Top errors */}
        <Panel
          title="Lỗi nghiêm trọng gần đây"
          action={<Link href="/logs/error" className="text-xs font-medium text-brand hover:brightness-90">Xem tất cả</Link>}
        >
          {(stats?.top_errors ?? []).length === 0 ? (
            <PanelEmpty>Không có lỗi nào gần đây.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {stats!.top_errors.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-700 dark:text-slate-300">{e.message}</p>
                    <p className="text-[11px] text-gray-400 dark:text-slate-500" title={formatDateTime(e.timestamp)}>
                      {logCategoryLabel(e.category)} · {formatRelative(e.timestamp, "—")}
                    </p>
                  </div>
                  <SeverityBadge severity={e.severity} showIcon={false} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Firmware Rollout */}
        <Panel
          title="Firmware Rollout"
          subtitle="Các đợt OTA đang chạy."
          action={<Link href="/ota" className="text-xs font-medium text-brand hover:brightness-90">Quản lý OTA</Link>}
        >
          {(stats?.firmware_rollouts ?? []).length === 0 ? (
            <PanelEmpty>Không có rollout nào đang chạy.</PanelEmpty>
          ) : (
            <div className="space-y-3 p-4">
              {stats!.firmware_rollouts.map((d) => (
                <div key={d.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-700 dark:text-slate-300">
                      {d.firmware_type === "gateway" ? "Gateway" : "Node"} FW v{d.firmware_version}
                      <span className="ml-1.5 text-xs text-gray-400 dark:text-slate-500">
                        · {d.scope === "fleet" ? "toàn fleet" : d.target_home_name ?? "một nhà"}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-gray-400 dark:text-slate-500">
                      {d.applied_count}/{d.target_count} · {d.progress_percent}%
                    </span>
                  </div>
                  <ProgressBar percent={d.progress_percent} colorClassName="bg-brand" />
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Recent Activities */}
        <Panel
          title="Hoạt động gần đây"
          className="xl:col-span-2"
          action={<Link href="/logs/activity" className="text-xs font-medium text-brand hover:brightness-90">User Activity Log</Link>}
        >
          {(stats?.recent_activity ?? []).length === 0 ? (
            <PanelEmpty>Chưa có hoạt động nào.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {stats!.recent_activity.map((a) => (
                <li key={a.id} className="flex items-start gap-2 px-4 py-2 text-sm">
                  <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-slate-600" />
                  <span className="min-w-0 flex-1 text-gray-600 dark:text-slate-400">{a.message}</span>
                  <span className="shrink-0 text-[11px] text-gray-400 dark:text-slate-500" title={formatDateTime(a.timestamp)}>
                    {formatRelative(a.timestamp, "—")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
