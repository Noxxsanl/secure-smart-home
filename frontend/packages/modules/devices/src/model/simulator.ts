/** Thao tác mô phỏng đang chạy (khoá các nút khác), null khi rảnh. */
export type SimulatorBusy = "off" | "on" | "door-open" | "door-close" | null;

/** Trạng thái + thao tác của bộ mô phỏng do `api/useSimulatorControls` trả về. */
export type SimulatorControlState = {
  /** Backend bật bộ mô phỏng (môi trường demo/dev). */
  enabled: boolean;
  busy: SimulatorBusy;
  powerOff: () => void;
  powerOn: () => void;
  openDoor: () => void;
  closeDoor: () => void;
};
