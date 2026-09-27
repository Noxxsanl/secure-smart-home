"use client";

import Link from "next/link";
import { AlertTriangle, Lightbulb, Router, Sparkles, Wifi } from "lucide-react";
import StatsCard from "@smarthome/shared/ui/StatsCard";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import { getHomeOverview, listSuggestions, MEMBER_ROLE_LABELS } from "@smarthome/shared/mock/portal";
import { relativeTime } from "@smarthome/shared/lib/time";
import HomeGate from "@/features/home/components/HomeGate";
import RoomTile from "@/features/rooms/components/RoomTile";
import DeviceCard from "@/features/devices/components/DeviceCard";
import { useDevicePower } from "@/features/devices/hooks/useDevicePower";
import { useHomeQuery } from "@/lib/portal-swr";

function Overview() {
  const { data, isLoading } = useHomeQuery("overview", getHomeOverview, { refreshInterval: 10_000 });
  const { data: suggestions } = useHomeQuery("suggestions", listSuggestions);
  const power = useDevicePower();

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  const controllable = data.devices.filter((d) => d.power !== null);
  const onCount = controllable.filter((d) => power.powerOf(d)).length;
  const onlineCount = data.devices.filter((d) => d.online).length;
  const pendingSuggestions = suggestions?.filter((s) => s.status === "pending").length ?? 0;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{data.home.name}</h1>
            <span className="rounded bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-slate-300">
              {MEMBER_ROLE_LABELS[data.role]}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{data.home.address}</p>
        </div>
        {data.gateway && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <Router className="h-4 w-4" /> Gateway
            <StatusBadge status={data.gateway.status} />
            {data.gateway.status === "offline" && data.gateway.last_seen && (
              <span className="text-xs">· online lần cuối {relativeTime(data.gateway.last_seen).toLowerCase()}</span>
            )}
          </div>
        )}
      </div>

      {pendingSuggestions > 0 && (
        <Link
          href="/automation"
          className="flex items-center gap-3 rounded-md border border-brand/30 bg-brand-soft/60 px-4 py-3 text-sm text-gray-800 transition hover:bg-brand-soft dark:text-slate-100"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-brand" />
          <span className="flex-1">
            Hệ thống nhận thấy {pendingSuggestions} thói quen lặp lại. Xem và quyết định có tự động hoá hay không.
          </span>
          <span className="font-semibold text-brand">Xem gợi ý →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatsCard
          title="Thiết bị đang bật" value={`${onCount}/${controllable.length}`} subtitle="Relay đèn, quạt, điều hoà…"
          icon={<Lightbulb className="h-4 w-4 text-brand" />} accent="bg-brand-soft text-brand"
        />
        <StatsCard
          title="Thiết bị online" value={`${onlineCount}/${data.devices.length}`} subtitle="Thiết bị offline không nhận lệnh"
          icon={<Wifi className="h-4 w-4 text-success" />} accent="bg-success-soft text-success"
        />
        <StatsCard
          title="Phòng" value={data.rooms.length} subtitle="Theo gói kit đã kích hoạt"
          icon={<Router className="h-4 w-4 text-info" />} accent="bg-gray-100 text-info dark:bg-slate-700"
        />
        <StatsCard
          title="Cảnh báo chưa xử lý" value={data.open_alerts} subtitle="Cảnh báo mức Warning/Critical chưa đọc"
          icon={<AlertTriangle className="h-4 w-4 text-warning" />} accent="bg-warning-soft text-warning"
        />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Phòng</h2>
          <Link href="/rooms" className="text-xs font-semibold text-brand hover:brightness-90">Tất cả phòng →</Link>
        </div>
        {data.rooms.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 dark:border-slate-700 px-4 py-6 text-center text-sm text-gray-500 dark:text-slate-400">
            Nhà chưa có phòng nào. Hoàn tất cài đặt WiFi cho Gateway trên ứng dụng di động để hệ thống ghép các thiết bị trong kit.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.rooms.map((room) => <RoomTile key={room.id} room={room} />)}
          </div>
        )}
      </section>

      {controllable.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Điều khiển nhanh</h2>
            <Link href="/devices" className="text-xs font-semibold text-brand hover:brightness-90">Tất cả thiết bị →</Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {controllable.map((d) => (
              <DeviceCard
                key={d.id} device={d}
                power={power.powerOf(d)} pending={power.isPending(d)}
                canToggle={power.canToggle(d)} onToggle={() => power.toggle(d)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function HomeOverviewPage() {
  return <HomeGate>{() => <Overview />}</HomeGate>;
}
