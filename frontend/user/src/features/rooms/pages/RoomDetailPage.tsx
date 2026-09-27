"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Cpu, Droplets, Thermometer, Zap } from "lucide-react";
import EmptyState from "@smarthome/shared/ui/EmptyState";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import { getRoom } from "@smarthome/shared/mock/portal";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import DeviceCard from "@/features/devices/components/DeviceCard";
import { useDevicePower } from "@/features/devices/hooks/useDevicePower";
import { portalErrorMessage } from "@/lib/errors";

export default function RoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const roomId = Number(id);
  const { customerId } = useCurrentHome();
  const { data, error, isLoading } = useSWR(
    ["/portal/room", customerId, roomId],
    () => getRoom(customerId, roomId),
    { refreshInterval: 10_000 },
  );
  const power = useDevicePower(data?.role);

  const back = (
    <Link href="/rooms" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
      <ArrowLeft className="h-4 w-4" /> Tất cả phòng
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-3">
        {back}
        <p className="rounded-md border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">{portalErrorMessage(error)}</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return <div className="space-y-3">{back}<Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }

  const { room, devices, home } = data;

  return (
    <div className="w-full space-y-4">
      {back}
      <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <p className="text-xs text-gray-400 dark:text-slate-500">{home.name}</p>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{room.name}</h1>
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-gray-700 dark:text-slate-300">
          {room.has_climate_data && (
            <>
              <span className="inline-flex items-center gap-1.5"><Thermometer className="h-4 w-4 text-critical" />{room.temperature}°C</span>
              <span className="inline-flex items-center gap-1.5"><Droplets className="h-4 w-4 text-info" />Độ ẩm {room.humidity}%</span>
            </>
          )}
          <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-warning" />{room.power_usage} W</span>
          <span className="inline-flex items-center gap-1.5"><Cpu className="h-4 w-4 text-gray-400" />{room.device_count} thiết bị · {room.on_count} đang bật</span>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <EmptyState icon={Cpu} title="Phòng chưa có thiết bị" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {devices.map((d) => (
            <DeviceCard
              key={d.id} device={d} showRoom={false}
              power={power.powerOf(d)} pending={power.isPending(d)}
              canToggle={power.canToggle(d)} onToggle={() => power.toggle(d)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
