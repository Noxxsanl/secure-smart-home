import { dashApi, dashPath } from "@smarthome/console/api/client";
import type { ConsoleDevice } from "@smarthome/console/api/types";

// §5 Simulator — chỉ tác động thiết bị `is_simulated` khi backend bật DEVICE_SIMULATOR.

export function simulatorStatusKey() {
  return dashPath("/simulator/status");
}

/** Ngắt/cấp nguồn giả lập; thiết bị chuyển offline sau cửa sổ 90 s như thật. */
export function setSimulatedPower(deviceId: number, online: boolean) {
  return dashApi<ConsoleDevice>(`/simulator/devices/${deviceId}/power`, {
    method: "POST",
    body: { online },
  });
}

/** Chỉ door_contact mô phỏng — sinh bản ghi cửa mở → thông báo DOOR_OPENED cho khách. */
export function simulateDoor(deviceId: number, open: boolean) {
  return dashApi<void>(`/simulator/devices/${deviceId}/door`, { method: "POST", body: { open } });
}
