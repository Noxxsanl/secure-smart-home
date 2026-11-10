"use client";

import type { CustomerDevice } from "@shh/api-client/portal";
import type { DevicePowerControl } from "../model/power";

type OpenCloseButtonsProps = {
  device: CustomerDevice;
  power: DevicePowerControl;
  size?: "sm" | "lg";
};

// Rèm cửa: 2 nút "Đóng" / "Mở" thay cho công tắc (turn_off = đóng, turn_on = mở). Nút của trạng thái hiện tại được tô
// đậm và không bấm lại được; thiết bị offline / không có quyền → cả hai bị khoá, lý do hiện ở title.
export default function OpenCloseButtons({ device, power, size = "sm" }: OpenCloseButtonsProps) {
  const open = power.powerOf(device) === true;
  const disabled = !power.canToggle(device);
  const reason = power.blockReason(device);
  const pad = size === "lg" ? "px-4 py-1.5 text-sm" : "px-2.5 py-1 text-xs";
  const options = [
    { value: false, label: "Đóng" },
    { value: true, label: "Mở" },
  ];

  return (
    <div
      role="group"
      aria-label={`Điều khiển ${device.device_name}`}
      title={reason ?? undefined}
      className="inline-flex shrink-0 rounded border border-gray-200 bg-gray-50 p-0.5 dark:border-slate-600 dark:bg-slate-900"
    >
      {options.map((option) => {
        const active = open === option.value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={active}
            disabled={disabled || active}
            onClick={() => power.setPower(device, option.value)}
            className={`rounded font-semibold transition ${pad} ${
              active
                ? "bg-brand text-white shadow-sm"
                : "text-gray-600 hover:bg-white disabled:text-gray-300 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
            } disabled:cursor-not-allowed`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
