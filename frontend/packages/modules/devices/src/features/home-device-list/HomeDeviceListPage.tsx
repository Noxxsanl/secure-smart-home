"use client";

import { useState } from "react";
import { Cpu, Info } from "lucide-react";
import { EmptyState, Skeleton, ErrorPanel } from "@shh/ui";
import { formatDate } from "@shh/utils";
import { MEMBER_ROLE_LABELS, useCurrentOverview, HomeGate } from "@shh/auth";
import DeviceCard from "../../ui/DeviceCard";
import { useDevicePower } from "../../api/useDevicePower";
import type { MyHome } from "@shh/api-client/portal";

type Filter = "all" | "on" | "offline";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "on", label: "Đang bật" },
  { value: "offline", label: "Offline" },
];

function roleNotice(home: MyHome): string | null {
  if (home.role === "VIEWER") {
    return `Với vai trò ${MEMBER_ROLE_LABELS.VIEWER}, bạn chỉ xem được trạng thái thiết bị. Nhờ chủ nhà nâng quyền nếu cần điều khiển.`;
  }
  if (home.role === "GUEST") {
    const until = home.expires_at ? ` Quyền khách có hiệu lực đến ${formatDate(home.expires_at)}.` : "";
    return `Bạn đang truy cập với vai trò ${MEMBER_ROLE_LABELS.GUEST}: chỉ thấy và điều khiển các thiết bị chủ nhà đã chỉ định.${until}`;
  }
  return null;
}

function Devices({ myHome }: { myHome: MyHome }) {
  const { data, error, mutate } = useCurrentOverview();
  const power = useDevicePower({ homeSuspended: (data?.home.status ?? myHome.home.status) === "suspended" });
  const [filter, setFilter] = useState<Filter>("all");

  // Gateway có thẻ riêng ở trang Tổng quan — danh sách này chỉ gồm node.
  const all = (data?.devices ?? []).filter((d) => d.category !== "gateway");
  const devices = all.filter((d) => (filter === "all" ? true : filter === "on" ? power.powerOf(d) === true : !d.online));

  const groups = [
    ...(data?.rooms ?? []).map((room) => ({
      key: String(room.id),
      title: room.name,
      items: devices.filter((d) => d.room_id === room.id),
    })),
    {
      key: "unassigned",
      title: "Chưa gán phòng",
      items: devices.filter((d) => d.room_id === null || !data?.rooms.some((r) => r.id === d.room_id)),
    },
  ].filter((g) => g.items.length > 0);

  const notice = roleNotice(myHome);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Thiết bị</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{all.length} thiết bị, nhóm theo phòng.</p>
        </div>
        <div className="flex items-center gap-1.5">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition
                ${filter === value ? "bg-brand text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <p className="flex items-center gap-2 rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-gray-600 dark:text-slate-300">
          <Info className="h-4 w-4 shrink-0 text-info" />
          {notice}
        </p>
      )}

      {!data ? (
        error ? (
          <ErrorPanel error={error} onRetry={() => mutate()} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}
          </div>
        )
      ) : groups.length === 0 ? (
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <EmptyState
            icon={Cpu}
            title={all.length === 0 ? "Chưa có thiết bị nào" : "Không có thiết bị phù hợp"}
            description={all.length === 0 ? "Thiết bị trong kit sẽ hiện ở đây sau khi Gateway được cài đặt WiFi trên ứng dụng di động." : "Thử đổi bộ lọc."}
          />
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{group.title}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {group.items.map((d) => <DeviceCard key={d.id} device={d} power={power} showRoom={false} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

export default function DeviceListPage() {
  return <HomeGate>{(home) => <Devices myHome={home} />}</HomeGate>;
}
