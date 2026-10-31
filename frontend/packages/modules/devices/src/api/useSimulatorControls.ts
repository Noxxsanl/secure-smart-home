"use client";

import { useState } from "react";
import { useToast } from "@shh/ui";
import { errorMessage } from "@shh/api-client/dashboard";
import { setSimulatedPower, simulateDoor } from "./simulator.api";
import { useSimulatorEnabled } from "./useSimulatorStatus";
import type { SimulatorBusy, SimulatorControlState } from "../model/simulator";

// Bộ mô phỏng (demo): mất điện → offline sau cửa sổ 90 s (cùng cơ chế với thiết bị
// thật), mở cửa → khách nhận thông báo DOOR_OPENED. `onChanged` chạy sau mỗi lệnh
// thành công để trang tải lại dữ liệu.
export function useSimulatorControls(deviceId: number, onChanged: () => void): SimulatorControlState {
  const enabled = useSimulatorEnabled();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<SimulatorBusy>(null);

  async function run(kind: Exclude<SimulatorBusy, null>, action: () => Promise<unknown>, successText: string) {
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

  return {
    enabled,
    busy,
    powerOff: () => void run("off", () => setSimulatedPower(deviceId, false), "Đã ngắt nguồn giả lập — thiết bị sẽ offline trong tối đa 90 giây."),
    powerOn: () => void run("on", () => setSimulatedPower(deviceId, true), "Đã cấp nguồn giả lập — thiết bị sẽ online lại sau ít giây."),
    openDoor: () => void run("door-open", () => simulateDoor(deviceId, true), "Đã mô phỏng mở cửa — khách hàng sẽ nhận thông báo."),
    closeDoor: () => void run("door-close", () => simulateDoor(deviceId, false), "Đã mô phỏng đóng cửa."),
  };
}
