"use client";

import Link from "next/link";
import { AlertTriangle, Lightbulb, PauseCircle, Router, Smartphone, Sparkles, Wifi } from "lucide-react";
import StatsCard from "@smarthome/shared/ui/StatsCard";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import InlineEdit from "@smarthome/shared/ui/InlineEdit";
import { exactly, useRevalidate } from "@/lib/api/client";
import { homesKey, overviewKey, updateHome } from "@/lib/api/homes";
import type { MyHome } from "@/lib/api/types";
import { portalErrorMessage } from "@/lib/errors";
import { lastSeenText } from "@/lib/format";
import { MEMBER_ROLE_LABELS, permissionsFor } from "@/lib/roles";
import ErrorPanel from "@/widgets/ErrorPanel";
import HomeGate from "@/features/home/components/HomeGate";
import { useCurrentOverview } from "@/features/home/hooks/useCurrentOverview";
import RoomTile from "@/features/rooms/components/RoomTile";
import DeviceCard from "@/features/devices/components/DeviceCard";
import { useDevicePower } from "@/features/devices/hooks/useDevicePower";

// GET /homes/:id/overview — polling 5 s (web không có WebSocket, CONTRACT §10).
function Overview({ myHome }: { myHome: MyHome }) {
  const { data, error, mutate } = useCurrentOverview();
  const revalidate = useRevalidate();
  const suspended = (data?.home.status ?? myHome.home.status) === "suspended";
  const power = useDevicePower({ homeSuspended: suspended });

  if (!data) {
    if (error) return <ErrorPanel error={error} onRetry={() => mutate()} />;
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  const perms = permissionsFor(data.role);
  // Gateway có thẻ riêng (data.gateway) — danh sách thiết bị chỉ gồm node.
  const devices = data.devices.filter((d) => d.category !== "gateway");
  const relays = devices.filter((d) => d.category === "relay" && d.power !== null);
  const onCount = relays.filter((d) => power.powerOf(d) === true).length;
  const onlineCount = devices.filter((d) => d.online).length;

  async function renameHome(name: string): Promise<string | null> {
    try {
      await updateHome(myHome.home.id, { name });
      await revalidate(exactly(homesKey), overviewKey(myHome.home.id));
      return null;
    } catch (err) {
      return portalErrorMessage(err);
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* InlineEdit có thể hiện <form> nên không đặt trong <h1> (HTML không cho phép). */}
            <div role="heading" aria-level={1} className="min-w-0">
              <InlineEdit
                value={data.home.name}
                label="Đổi tên nhà"
                canEdit={perms.canRename}
                maxLength={128}
                onSave={renameHome}
                textClassName="text-lg font-semibold text-gray-900 dark:text-slate-100"
              />
            </div>
            <span className="rounded bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-slate-300">
              {MEMBER_ROLE_LABELS[data.role]}
            </span>
            {suspended && <StatusBadge status="suspended" label="Tạm ngưng" />}
          </div>
          {data.home.address && <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{data.home.address}</p>}
        </div>

        {data.gateway ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <Router className="h-4 w-4" /> Gateway
            <StatusBadge status={data.gateway.status} />
            {data.gateway.status === "offline" && (
              <span className="text-xs">· {lastSeenText(data.gateway.last_seen)}</span>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <Smartphone className="h-4 w-4" /> Gateway chưa được ghép
          </p>
        )}
      </div>

      {suspended && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Dịch vụ của nhà này đang tạm ngưng: bạn vẫn xem được dữ liệu nhưng chưa điều khiển thiết bị hay thay đổi tự động hoá
          được. Vui lòng liên hệ bộ phận hỗ trợ.
        </p>
      )}

      {data.gateway?.status === "offline" && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Gateway đang offline nên các thiết bị trong nhà tạm thời không nhận lệnh. Kiểm tra nguồn điện và WiFi của Gateway;
          hệ thống sẽ tự cập nhật khi Gateway kết nối lại.
        </p>
      )}

      {data.pending_suggestions > 0 && perms.canViewAutomation && (
        <Link
          href="/automation"
          className="flex items-center gap-3 rounded-md border border-brand/30 bg-brand-soft/60 px-4 py-3 text-sm text-gray-800 transition hover:bg-brand-soft dark:text-slate-100"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-brand" />
          <span className="flex-1">
            Hệ thống nhận thấy {data.pending_suggestions} thói quen lặp lại. Xem và quyết định có tự động hoá hay không.
          </span>
          <span className="font-semibold text-brand">Xem gợi ý →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatsCard
          title="Thiết bị đang bật" value={`${onCount}/${relays.length}`} subtitle="Relay đèn, quạt…"
          icon={<Lightbulb className="h-4 w-4 text-brand" />} accent="bg-brand-soft text-brand"
        />
        <StatsCard
          title="Thiết bị online" value={`${onlineCount}/${devices.length}`} subtitle="Thiết bị offline không nhận lệnh"
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

      {relays.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Điều khiển nhanh</h2>
            <Link href="/devices" className="text-xs font-semibold text-brand hover:brightness-90">Tất cả thiết bị →</Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {relays.map((d) => <DeviceCard key={d.id} device={d} power={power} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export default function HomeOverviewPage() {
  return <HomeGate>{(home) => <Overview myHome={home} />}</HomeGate>;
}
