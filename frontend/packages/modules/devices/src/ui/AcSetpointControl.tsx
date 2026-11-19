"use client";

import { Minus, Plus } from "lucide-react";
import type { CustomerDevice } from "@shh/api-client/portal";
import type { DevicePowerControl } from "../model/power";
import { AC_SETPOINT_MAX, AC_SETPOINT_MIN } from "../model/appliance";

type AcSetpointControlProps = {
  device: CustomerDevice;
  power: DevicePowerControl;
  size?: "sm" | "lg";
};

// Điều hòa: "Đặt 26°C" + nút − / + (bước 1 °C, 16..30). Khoá theo cùng lý do với công tắc (quyền, offline, bị khoá,
// nhà tạm ngưng) và khi đang chờ lệnh; bấm nhanh nhiều lần được gộp thành 1 lệnh ở useDevicePower.
export default function AcSetpointControl({ device, power, size = "sm" }: AcSetpointControlProps) {
  const value = power.setpointOf(device);
  const enabled = power.canAdjustSetpoint(device);
  const reason = power.blockReason(device);
  const lg = size === "lg";
  const buttonClass = `inline-flex items-center justify-center rounded border border-gray-200 text-gray-600 transition
    hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent
    dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 dark:disabled:text-slate-600 dark:disabled:hover:bg-transparent
    ${lg ? "h-9 w-9" : "h-7 w-7"}`;
  const iconClass = lg ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <div
      role="group"
      aria-label={`Nhiệt độ đặt của ${device.device_name}`}
      title={reason ?? undefined}
      className="flex items-center justify-between gap-2"
    >
      <span
        aria-live="polite"
        className={`font-semibold tabular-nums ${lg ? "text-base" : "text-sm"} ${
          power.isSetpointPending(device) ? "text-brand" : "text-gray-900 dark:text-slate-100"
        }`}
      >
        {value === null ? "Đặt --" : `Đặt ${value}°C`}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Giảm 1°C"
          disabled={!enabled || (value !== null && value <= AC_SETPOINT_MIN)}
          onClick={() => power.adjustSetpoint(device, -1)}
          className={buttonClass}
        >
          <Minus className={iconClass} />
        </button>
        <button
          type="button"
          aria-label="Tăng 1°C"
          disabled={!enabled || (value !== null && value >= AC_SETPOINT_MAX)}
          onClick={() => power.adjustSetpoint(device, 1)}
          className={buttonClass}
        >
          <Plus className={iconClass} />
        </button>
      </span>
    </div>
  );
}
