"use client";

import type { CustomerDevice } from "@shh/api-client/portal";
import type { DevicePowerControl } from "../model/power";
import { CURTAIN_LEVELS, activeCurtainLevel } from "../model/curtain";

type OpenCloseButtonsProps = {
  device: CustomerDevice;
  power: DevicePowerControl;
  size?: "sm" | "lg";
};

// Rèm cửa: 3 nút mức mở "Đóng · 50% · 100%" thay cho công tắc (gửi set_pos 0/50/100). Nút của mức hiện tại được
// tô đậm và không bấm lại được; thiết bị offline / không có quyền / đang chờ xác nhận → cả 3 bị khoá, lý do hiện ở title.
export default function OpenCloseButtons({ device, power, size = "sm" }: OpenCloseButtonsProps) {
  const active = activeCurtainLevel(power.curtainPosOf(device), power.powerOf(device));
  const disabled = !power.canToggle(device);
  const reason = power.blockReason(device);
  const pad = size === "lg" ? "px-5 py-1.5 text-sm" : "px-3.5 py-1 text-xs";

  return (
    <div
      role="group"
      aria-label={`Điều khiển ${device.device_name}`}
      title={reason ?? undefined}
      className="inline-flex shrink-0 rounded border border-gray-200 bg-gray-50 p-0.5 dark:border-slate-600 dark:bg-slate-900"
    >
      {CURTAIN_LEVELS.map((level) => {
        const selected = active === level.position;
        return (
          <button
            key={level.position}
            type="button"
            aria-pressed={selected}
            aria-label={level.position === 0 ? "Đóng rèm" : `Mở rèm ${level.label}`}
            disabled={disabled || selected}
            onClick={() => void power.setCurtainPosition(device, level.position)}
            className={`rounded font-semibold transition ${pad} ${
              selected
                ? "bg-brand text-white shadow-sm"
                : "text-gray-600 hover:bg-white disabled:text-gray-300 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
            } disabled:cursor-not-allowed`}
          >
            {level.label}
          </button>
        );
      })}
    </div>
  );
}
