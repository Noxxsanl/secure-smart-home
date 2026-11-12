import type { CustomerDevice } from "@shh/api-client/portal";

/** Bộ bật/tắt relay do `api/useDevicePower` trả về; thẻ thiết bị (ui/) nhận qua props. */
export type DevicePowerControl = {
  /** Trạng thái hiển thị: giá trị tạm (optimistic) nếu đang chờ xác nhận, không thì của server. */
  powerOf: (device: CustomerDevice) => boolean | null;
  isPending: (device: CustomerDevice) => boolean;
  canToggle: (device: CustomerDevice) => boolean;
  /** Lý do không bật/tắt được (để hiện gợi ý), null nếu điều khiển được. */
  blockReason: (device: CustomerDevice) => string | null;
  toggle: (device: CustomerDevice) => Promise<void>;
  /** Đặt hẳn bật/tắt (nút Mở/Đóng của rèm); trùng trạng thái hiện tại thì không gửi lệnh. */
  setPower: (device: CustomerDevice, on: boolean) => Promise<void>;
  /** Điều hòa: nhiệt độ đặt hiển thị (giá trị tạm khi đang chỉnh, không thì của server); null = chưa biết. */
  setpointOf: (device: CustomerDevice) => number | null;
  /** Điều hòa: có thể bấm −/+ (đúng quyền, online, không có lệnh nhiệt độ đang gửi). */
  canAdjustSetpoint: (device: CustomerDevice) => boolean;
  /** Điều hòa: đang chờ gửi (debounce) hoặc chờ thiết bị xác nhận lệnh nhiệt độ. */
  isSetpointPending: (device: CustomerDevice) => boolean;
  /** Điều hòa: tăng/giảm nhiệt độ đặt `delta` °C (kẹp 16..30); bấm nhanh nhiều lần chỉ gửi 1 lệnh. */
  adjustSetpoint: (device: CustomerDevice, delta: number) => void;
  /** Điều hòa: đặt thẳng nhiệt độ 16..30 (ô mã trong lưới); cùng debounce, điều hòa đang tắt sẽ được bật. */
  setSetpoint: (device: CustomerDevice, temperature: number) => void;
};
