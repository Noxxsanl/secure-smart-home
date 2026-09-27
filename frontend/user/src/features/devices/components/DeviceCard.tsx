"use client";

import Link from "next/link";
import { WifiOff } from "lucide-react";
import Switch from "@smarthome/shared/ui/Switch";
import { relativeTime } from "@smarthome/shared/lib/time";
import type { PortalDevice } from "@smarthome/shared/mock/portal";
import { DEVICE_ICONS, deviceIconKey } from "@/features/devices/components/DeviceIcon";

type DeviceCardProps = {
  device: PortalDevice;
  power: boolean | null;
  pending: boolean;
  canToggle: boolean;
  onToggle: () => void;
  showRoom?: boolean;
};

export default function DeviceCard({ device, power, pending, canToggle, onToggle, showRoom = true }: DeviceCardProps) {
  const Icon = DEVICE_ICONS[deviceIconKey(device)];
  const on = power === true;

  return (
    <div
      className={`flex flex-col gap-3 rounded-md border p-4 transition
        ${on ? "border-brand/40 bg-brand-soft/40" : "border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded ${on ? "bg-brand text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400"}`}>
          <Icon className="h-5 w-5" />
        </div>
        {power !== null && (
          <Switch
            checked={on}
            disabled={!canToggle}
            onChange={onToggle}
            label={`${on ? "Tắt" : "Bật"} ${device.device_name}`}
          />
        )}
      </div>

      <Link href={`/devices/${device.id}`} className="group min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-brand dark:text-slate-100">{device.device_name}</p>
        {showRoom && <p className="truncate text-xs text-gray-400 dark:text-slate-500">{device.room_name}</p>}
      </Link>

      <div className="flex items-center justify-between gap-2 text-xs">
        {device.online ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <span className="h-2 w-2 rounded-full bg-success" /> Online
          </span>
        ) : (
          // FR-5.5: offline hiển thị rõ + thời điểm online cuối, nút bị vô hiệu.
          <span className="inline-flex items-center gap-1.5 text-gray-400 dark:text-slate-500">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            {device.last_seen ? `Online lần cuối ${relativeTime(device.last_seen).toLowerCase()}` : "Offline"}
          </span>
        )}
        {power !== null && (
          <span className={`shrink-0 font-semibold ${on ? "text-brand" : "text-gray-400 dark:text-slate-500"}`}>
            {pending ? "Đang gửi lệnh…" : on ? "Đang bật" : "Đang tắt"}
          </span>
        )}
      </div>
    </div>
  );
}
