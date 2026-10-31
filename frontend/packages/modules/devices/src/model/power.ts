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
};
