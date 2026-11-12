"use client";

import Link from "next/link";
import { Ban, WifiOff } from "lucide-react";
import { Switch } from "@shh/ui";
import type { CustomerDevice } from "@shh/api-client/portal";
import { lastSeenText } from "@shh/utils";
import DeviceIcon from "./DeviceIcon";
import DeviceReading from "./DeviceReading";
import OpenCloseButtons from "./OpenCloseButtons";
import type { DevicePowerControl } from "../model/power";
import AcSetpointControl from "./AcSetpointControl";
import { APPLIANCE_TEXT, applianceKind, isAirConditioner } from "../model/appliance";

type DeviceCardProps = {
  device: CustomerDevice;
  power: DevicePowerControl;
  showRoom?: boolean;
};

export default function DeviceCard({ device, power, showRoom = true }: DeviceCardProps) {
  const isRelay = device.category === "relay" && device.power !== null;
  const value = power.powerOf(device);
  const on = isRelay && value === true;
  const pending = power.isPending(device);
  const reason = power.blockReason(device);
  const kind = applianceKind(device);
  const words = APPLIANCE_TEXT[kind ?? "switch"];

  return (
    <div
      className={`flex flex-col gap-3 rounded-md border p-4 transition
        ${on ? "border-brand/40 bg-brand-soft/40" : "border-[#E5EAF0] bg-white dark:border-slate-700 dark:bg-slate-800"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded ${on ? "bg-brand text-white" : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400"}`}>
          <DeviceIcon device={device} className="h-5 w-5" />
        </div>
        {isRelay && kind === "curtain" && <OpenCloseButtons device={device} power={power} />}
        {isRelay && kind !== "curtain" && (
          <span title={reason ?? undefined}>
            <Switch
              checked={on}
              disabled={!power.canToggle(device)}
              onChange={() => power.toggle(device)}
              label={`${on ? words.turnOff : words.turnOn} ${device.device_name}`}
            />
          </span>
        )}
      </div>

      <Link href={`/devices/${device.id}`} className="group min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-brand dark:text-slate-100">{device.device_name}</p>
        {showRoom && (
          <p className="truncate text-xs text-gray-400 dark:text-slate-500">{device.room_name ?? "Chưa gán phòng"}</p>
        )}
      </Link>

      {!isRelay && <DeviceReading device={device} />}
      {isRelay && isAirConditioner(device) && <AcSetpointControl device={device} power={power} />}

      <div className="flex items-center justify-between gap-2 text-xs">
        {device.status === "blocked" ? (
          <span className="inline-flex items-center gap-1.5 text-critical">
            <Ban className="h-3.5 w-3.5 shrink-0" /> Đã bị khoá
          </span>
        ) : device.online ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <span className="h-2 w-2 rounded-full bg-success" /> Online
          </span>
        ) : (
          // FR-5.5: offline hiển thị rõ + thời điểm online cuối, nút bị vô hiệu.
          <span className="inline-flex min-w-0 items-center gap-1.5 text-gray-400 dark:text-slate-500">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Offline · {lastSeenText(device.last_seen)}</span>
          </span>
        )}
        {isRelay && (
          <span className={`shrink-0 font-semibold ${on ? "text-brand" : "text-gray-400 dark:text-slate-500"}`}>
            {pending ? "Đang gửi lệnh…" : on ? words.on : words.off}
          </span>
        )}
      </div>
    </div>
  );
}
