"use client";

import { logCategoryLabel } from "@shh/api-client/dashboard";
import Link from "next/link";
import { KeyRound, Ticket, AlertTriangle, Server, CirclePlus } from "lucide-react";
import { StatsCard, StatusBadge, SeverityBadge, Panel, PanelEmpty, LoadErrorBar, BTN_PRIMARY } from "@shh/ui";
import { useAuth } from "@shh/auth";
import { useNow, formatDateTime, formatRelative, formatRemaining } from "@shh/utils";
import { useOperatorDashboard } from "../../api/useOperatorDashboard";

export default function OperatorDashboardPage() {
  const { user } = useAuth();
  const { stats, isLoading, error, refresh } = useOperatorDashboard();
  const now = useNow();
  const placeholder = isLoading && !stats;

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Xin chào, {user?.display_name ?? user?.username ?? "Operator"}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            Các nhà đang hỗ trợ, gateway mất kết nối và cảnh báo vận hành cần xử lý.
          </p>
        </div>
        <Link href="/gateways/register" className={BTN_PRIMARY}>
          <CirclePlus className="h-3.5 w-3.5" /> Đăng ký Gateway
        </Link>
      </div>

      {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

      {/* KPI Row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Đang hỗ trợ" value={placeholder ? "—" : stats?.active_access_grants.length ?? 0}
          subtitle="Quyền truy cập nhà còn hiệu lực của bạn."
          accent="bg-brand-soft text-brand" iconBg="bg-brand-soft"
          icon={<KeyRound className="h-4 w-4 text-brand" />} />
        <StatsCard title="Ticket mở" value={placeholder ? "—" : stats?.open_tickets ?? 0}
          subtitle="Thông báo hỗ trợ chưa đọc."
          accent="bg-warning-soft text-warning" iconBg="bg-warning-soft"
          icon={<Ticket className="h-4 w-4 text-warning" />} />
        <StatsCard title="Alert cần xử lý" value={placeholder ? "—" : stats?.alerts_to_handle ?? 0}
          subtitle="Cảnh báo Warning/Critical trong 24 giờ qua."
          accent="bg-critical-soft text-critical" iconBg="bg-critical-soft"
          icon={<AlertTriangle className="h-4 w-4 text-critical" />} />
        <StatsCard title="Gateway offline" value={placeholder ? "—" : `${stats?.gateways_offline ?? 0}/${stats?.gateways_total ?? 0}`}
          subtitle="Gateway mất kết nối / tổng số."
          accent="bg-critical-soft text-critical" iconBg="bg-critical-soft"
          icon={<Server className="h-4 w-4 text-critical" />} />
      </div>

      <div className="grid gap-3">
        {/* Active access grants */}
        <Panel title="Nhà đang hỗ trợ" subtitle="Quyền truy cập có thời hạn của bạn (Operator Home Access).">
          {(stats?.active_access_grants ?? []).length === 0 ? (
            <PanelEmpty>Bạn chưa có quyền truy cập nhà nào. Mở trang Smart Home của nhà cần hỗ trợ để xin quyền.</PanelEmpty>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {stats!.active_access_grants.map((g) => {
                const remaining = formatRemaining(g.expires_at, now);
                return (
                  <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/smart-homes/${g.home_id}`} className="truncate text-sm font-medium text-gray-900 dark:text-slate-100 hover:text-brand">
                        {g.home_name}
                      </Link>
                      <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                        Lý do: {g.reason}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500">
                        Hết hạn {formatDateTime(g.expires_at)}{remaining ? ` (còn ${remaining})` : ""}
                      </p>
                    </div>
                    <StatusBadge status="active" label="Đang hiệu lực" />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Recent operational logs */}
      <Panel title="Sự kiện vận hành gần đây" subtitle="10 sự kiện mới nhất của Gateway, Device và Provision.">
        {(stats?.recent_logs ?? []).length === 0 ? (
          <PanelEmpty>Chưa có sự kiện vận hành nào.</PanelEmpty>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {stats!.recent_logs.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 dark:text-slate-300">{l.message}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">
                    <Link href={`/logs/${l.category}`} className="font-medium hover:text-brand">{logCategoryLabel(l.category)}</Link>
                    {l.home_name ? ` · ${l.home_name}` : ""}
                    {" · "}<span title={formatDateTime(l.timestamp)}>{formatRelative(l.timestamp, "—")}</span>
                  </p>
                </div>
                <SeverityBadge severity={l.severity} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
