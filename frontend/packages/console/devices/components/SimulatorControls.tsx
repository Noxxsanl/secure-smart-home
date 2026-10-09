"use client";

import { useState } from "react";
import { DoorClosed, DoorOpen, FlaskConical, Power, PowerOff } from "lucide-react";
import Panel from "@smarthome/console/components/Panel";
import { useToast } from "@smarthome/shared/ui/Toast";
import { useSimulatorEnabled } from "@smarthome/console/devices/hooks/useSimulatorStatus";
import { setSimulatedPower, simulateDoor } from "@smarthome/console/api/simulator.api";
import { errorMessage } from "@smarthome/console/lib/errors";
import { BTN_SECONDARY, BTN_SUCCESS_SOFT, BTN_WARNING_SOFT } from "@smarthome/console/lib/ui";
import type { DeviceCategory } from "@smarthome/console/api/types";

type SimulatorControlsProps = {
  deviceId: number;
  category: DeviceCategory;
  isSimulated: boolean;
  /** Trạng thái nguồn giả lập hiện tại nếu biết (Gateway DTO không có → hiện cả hai nút). */
  simOnline?: boolean | null;
  /** Gọi sau khi một lệnh mô phỏng thành công để trang tải lại dữ liệu. */
  onChanged: () => void;
};

type Busy = "off" | "on" | "door-open" | "door-close" | null;

// Bộ mô phỏng (demo) — chỉ hiện khi backend báo `enabled` VÀ thiết bị là `is_simulated`.
// Dùng để diễn tập tình huống thật mà không cần phần cứng: mất điện → offline sau cửa sổ 90 s
// (cùng cơ chế với thiết bị thật), mở cửa → khách nhận thông báo DOOR_OPENED.
export default function SimulatorControls({ deviceId, category, isSimulated, simOnline, onChanged }: SimulatorControlsProps) {
  const enabled = useSimulatorEnabled();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<Busy>(null);

  if (!enabled || !isSimulated) return null;

  async function run(kind: Exclude<Busy, null>, action: () => Promise<unknown>, successText: string) {
    if (busy) return;
    setBusy(kind);
    try {
      await action();
      onChanged();
      showToast(successText);
    } catch (err) {
      showToast(errorMessage(err), false);
    } finally {
      setBusy(null);
    }
  }

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
              onClick={() => run("off", () => setSimulatedPower(deviceId, false), "Đã ngắt nguồn giả lập — thiết bị sẽ offline trong tối đa 90 giây.")}
              className={BTN_WARNING_SOFT}
            >
              <PowerOff className="h-3.5 w-3.5" /> Ngắt nguồn (mô phỏng mất điện)
            </button>
          )}
          {showPowerOn && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("on", () => setSimulatedPower(deviceId, true), "Đã cấp nguồn giả lập — thiết bị sẽ online lại sau ít giây.")}
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
                onClick={() => run("door-open", () => simulateDoor(deviceId, true), "Đã mô phỏng mở cửa — khách hàng sẽ nhận thông báo.")}
                className={BTN_SECONDARY}
              >
                <DoorOpen className="h-3.5 w-3.5" /> Mô phỏng mở cửa
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run("door-close", () => simulateDoor(deviceId, false), "Đã mô phỏng đóng cửa.")}
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
