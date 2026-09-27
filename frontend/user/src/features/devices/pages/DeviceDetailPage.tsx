"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, WifiOff } from "lucide-react";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import Switch from "@smarthome/shared/ui/Switch";
import SensorChart from "@smarthome/shared/ui/SensorChart";
import { relativeTime } from "@smarthome/shared/lib/time";
import { generateSensorData, mockDelay } from "@smarthome/shared/mock/store";
import { getDevice, permissionsFor } from "@smarthome/shared/mock/portal";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import { DEVICE_ICONS, deviceIconKey } from "@/features/devices/components/DeviceIcon";
import { useDevicePower } from "@/features/devices/hooks/useDevicePower";
import { portalErrorMessage } from "@/lib/errors";

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const deviceId = Number(id);
  const { customerId } = useCurrentHome();
  const { data, error, isLoading } = useSWR(
    ["/portal/device", customerId, deviceId],
    () => getDevice(customerId, deviceId),
    { refreshInterval: 10_000 },
  );
  const isSensor = data?.device.power === null;
  // Telemetry chỉ tải khi đã xác nhận quyền xem thiết bị (getDevice thành công).
  const { data: telemetry, isLoading: telemetryLoading } = useSWR(
    data && isSensor ? ["/portal/telemetry", customerId, deviceId] : null,
    () => mockDelay(generateSensorData(deviceId)),
  );
  const power = useDevicePower(data?.role);

  const back = (
    <Link href="/devices" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
      <ArrowLeft className="h-4 w-4" /> Tất cả thiết bị
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
    return <div className="space-y-3">{back}<Skeleton className="h-32 w-full" /></div>;
  }

  const { device, room, home, role } = data;
  const Icon = DEVICE_ICONS[deviceIconKey(device)];
  const on = power.powerOf(device) === true;
  const canControl = power.canToggle(device);

  return (
    <div className="w-full space-y-4">
      {back}

      <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded ${on ? "bg-brand text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400"}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{device.device_name}</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">{room?.name ?? "—"} · {home.name}</p>
            </div>
          </div>
          <StatusBadge status={device.online ? "online" : "offline"} />
        </div>

        {!device.online && (
          <p className="mt-4 flex items-center gap-2 rounded bg-gray-50 dark:bg-slate-900 px-3 py-2 text-sm text-gray-600 dark:text-slate-300">
            <WifiOff className="h-4 w-4 shrink-0" />
            Thiết bị đang offline{device.last_seen ? ` — online lần cuối ${relativeTime(device.last_seen).toLowerCase()}` : ""}. Kiểm tra nguồn điện và kết nối của thiết bị.
          </p>
        )}

        {device.power !== null && (
          <div className="mt-5 flex items-center justify-between rounded border border-gray-100 dark:border-slate-700 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{on ? "Đang bật" : "Đang tắt"}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">
                {power.isPending(device)
                  ? "Đang chờ thiết bị xác nhận…"
                  : permissionsFor(role).canControl ? "Bấm để bật/tắt" : "Vai trò của bạn chỉ được xem"}
              </p>
            </div>
            <Switch checked={on} disabled={!canControl} onChange={() => power.toggle(device)} label={`${on ? "Tắt" : "Bật"} ${device.device_name}`} />
          </div>
        )}
      </div>

      {isSensor && (
        <SensorChart data={telemetry ?? []} isLoading={telemetryLoading} />
      )}
    </div>
  );
}
