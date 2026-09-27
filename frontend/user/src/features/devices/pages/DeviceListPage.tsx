"use client";

import { useState } from "react";
import { Cpu, Info } from "lucide-react";
import EmptyState from "@smarthome/shared/ui/EmptyState";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import { getHomeOverview, MEMBER_ROLE_LABELS } from "@smarthome/shared/mock/portal";
import HomeGate from "@/features/home/components/HomeGate";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import DeviceCard from "@/features/devices/components/DeviceCard";
import { useDevicePower } from "@/features/devices/hooks/useDevicePower";
import { useHomeQuery } from "@/lib/portal-swr";

type Filter = "all" | "on" | "offline";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "on", label: "Đang bật" },
  { value: "offline", label: "Offline" },
];

function Devices() {
  const { current, permissions } = useCurrentHome();
  const { data, isLoading } = useHomeQuery("overview", getHomeOverview, { refreshInterval: 10_000 });
  const power = useDevicePower();
  const [filter, setFilter] = useState<Filter>("all");

  const devices = (data?.devices ?? []).filter((d) =>
    filter === "all" ? true : filter === "on" ? power.powerOf(d) === true : !d.online
  );
  const rooms = (data?.rooms ?? []).filter((r) => devices.some((d) => d.room_id === r.id));

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Thiết bị</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{data?.devices.length ?? 0} thiết bị, nhóm theo phòng.</p>
        </div>
        <div className="flex items-center gap-1.5">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value} type="button" onClick={() => setFilter(value)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition
                ${filter === value ? "bg-brand text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {permissions && !permissions.canControl && current && (
        <p className="flex items-center gap-2 rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-gray-600 dark:text-slate-300">
          <Info className="h-4 w-4 shrink-0 text-info" />
          Với vai trò {MEMBER_ROLE_LABELS[current.role]}, bạn chỉ xem được trạng thái thiết bị. Nhờ chủ nhà nâng quyền nếu cần điều khiển.
        </p>
      )}

      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <EmptyState icon={Cpu} title="Không có thiết bị phù hợp" description="Thử đổi bộ lọc." />
        </div>
      ) : (
        rooms.map((room) => (
          <section key={room.id} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{room.name}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {devices.filter((d) => d.room_id === room.id).map((d) => (
                <DeviceCard
                  key={d.id} device={d} showRoom={false}
                  power={power.powerOf(d)} pending={power.isPending(d)}
                  canToggle={power.canToggle(d)} onToggle={() => power.toggle(d)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

export default function DeviceListPage() {
  return <HomeGate>{() => <Devices />}</HomeGate>;
}
