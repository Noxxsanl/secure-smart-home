"use client";

import { DoorClosed, DoorOpen, FlaskConical, Power, PowerOff } from "lucide-react";
import { Panel, BTN_SECONDARY, BTN_SUCCESS_SOFT, BTN_WARNING_SOFT } from "@shh/ui";
import type { DeviceCategory } from "@shh/api-client/dashboard";
import type { SimulatorControlState } from "../model/simulator";

type SimulatorControlsProps = {
  /** Kết quả của `useSimulatorControls` (api/). */
  sim: SimulatorControlState;
  category: DeviceCategory;
  isSimulated: boolean;
  /** Trạng thái nguồn giả lập hiện tại nếu biết (Gateway DTO không có → hiện cả hai nút). */
  simOnline?: boolean | null;
};

// Bộ mô phỏng (demo) — chỉ hiện khi backend báo `enabled` VÀ thiết bị là `is_simulated`.
// Dùng để diễn tập tình huống thật mà không cần phần cứng.
export default function SimulatorControls({ sim, category, isSimulated, simOnline }: SimulatorControlsProps) {
  if (!sim.enabled || !isSimulated) return null;
  const { busy } = sim;

  const showPowerOff = simOnline !== false;
  const showPowerOn = simOnline !== true;

  return (
    <Panel
      title={<span className="inline-flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5 text-brand" /> Bộ mô phỏng (demo)</span>}
      subtitle="Thiết bị này là thiết bị giả lập do backend điều khiển — chỉ có trong môi trường demo."
    >
      <div className="space-y-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {showPowerOff && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={sim.powerOff}
              className={BTN_WARNING_SOFT}
            >
              <PowerOff className="h-3.5 w-3.5" /> Ngắt nguồn (mô phỏng mất điện)
            </button>
          )}
          {showPowerOn && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={sim.powerOn}
              className={BTN_SUCCESS_SOFT}
            >
              <Power className="h-3.5 w-3.5" /> Cấp nguồn lại
            </button>
          )}
          {category === "door_contact" && (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={sim.openDoor}
                className={BTN_SECONDARY}
              >
                <DoorOpen className="h-3.5 w-3.5" /> Mô phỏng mở cửa
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={sim.closeDoor}
                className={BTN_SECONDARY}
              >
                <DoorClosed className="h-3.5 w-3.5" /> Mô phỏng đóng cửa
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500">
          Ngắt nguồn không làm thiết bị offline ngay: trạng thái online được tính theo lần cuối thấy thiết bị trong 90 giây gần nhất.
        </p>
      </div>
    </Panel>
  );
}
