"use client";

import Link from "next/link";
import { QrCode, KeyRound, Ticket, AlertTriangle, ArrowRight } from "lucide-react";
import StatsCard from "@/features/dashboard/components/StatsCard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useOperatorDashboard } from "@/features/dashboard/hooks/useOperatorDashboard";
import { smartHomeStore } from "@/shared/mock/store";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function OperatorDashboardPage() {
  const { user } = useAuth();
  const { stats, isLoading } = useOperatorDashboard();

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
          Xin chào, {user?.username ?? "Operator"}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Hàng đợi provisioning và các nhà đang hỗ trợ.
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Provisioning Queue" value={isLoading ? "—" : stats?.provisioningQueue.length ?? 0}
          subtitle="Smart Home chờ xử lý (chưa kích hoạt)."
          accent="bg-warning-soft text-warning" iconBg="bg-warning-soft"
          icon={<QrCode className="h-4 w-4 text-warning" />} />
        <StatsCard title="Đang hỗ trợ" value={isLoading ? "—" : stats?.activeAccessGrants.length ?? 0}
          subtitle="Smart Home đang có quyền truy cập hiệu lực."
          accent="bg-brand-soft text-brand" iconBg="bg-brand-soft"
          icon={<KeyRound className="h-4 w-4 text-brand" />} />
        <StatsCard title="Ticket mở" value={isLoading ? "—" : stats?.openTickets ?? 0}
          subtitle="Thông báo hỗ trợ chưa xử lý."
          accent="bg-warning-soft text-warning" iconBg="bg-warning-soft"
          icon={<Ticket className="h-4 w-4 text-warning" />} />
        <StatsCard title="Alert cần xử lý" value={isLoading ? "—" : stats?.alertsToHandle ?? 0}
          subtitle="Cảnh báo mức Warning/Critical."
          accent="bg-critical-soft text-critical" iconBg="bg-critical-soft"
          icon={<AlertTriangle className="h-4 w-4 text-critical" />} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* Provisioning queue */}
        <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Provisioning Queue</p>
            <Link href="/smart-homes/new" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:brightness-90">
              + Tạo Home
            </Link>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {(stats?.provisioningQueue ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Không có Home nào đang chờ xử lý.</p>
            ) : (
              stats!.provisioningQueue.map((h) => (
                <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{h.name}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{h.package} · {h.address}</p>
                  </div>
                  <Link
                    href={`/smart-homes/${h.id}`}
                    className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
                  >
                    Xem <ArrowRight size={11} />
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Active access grants */}
        <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Nhà đang hỗ trợ (Operator Home Access)</p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {(stats?.activeAccessGrants ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Bạn chưa được cấp quyền hỗ trợ nhà nào.</p>
            ) : (
              stats!.activeAccessGrants.map((g) => {
                const home = smartHomeStore.get(g.home_id);
                return (
                  <div key={g.id} className="px-4 py-2.5">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{home?.name ?? `Home #${g.home_id}`}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      hết hạn {formatDateTime(g.expires_at)} · Lý do: {g.reason}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
