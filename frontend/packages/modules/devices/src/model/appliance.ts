import type { CustomerDevice } from "@shh/api-client/portal";

// Relay chỉ biết là "công tắc" (backend chỉ có turn_on/turn_off) — đoán đồ vật theo tên do kit / `hw:register` đặt sẵn
// ("Đèn phòng khách", "Rèm cửa phòng khách"…) để chọn icon, chữ trạng thái và kiểu điều khiển. Khách đổi tên mất
// từ khoá thì thiết bị quay về "công tắc" chung, vẫn bật/tắt được.
export type ApplianceKind = "lamp" | "fan" | "curtain" | "ac" | "switch";

// Ưu tiên `appliance` do backend gán; thiếu (dữ liệu cũ) mới đoán theo tên.
export function applianceKind(
  device: Pick<CustomerDevice, "category" | "device_name" | "appliance">,
): ApplianceKind | null {
  if (device.category !== "relay") return null;
  if (device.appliance) return device.appliance;
  const name = device.device_name;
  if (/rèm|curtain|blind/i.test(name)) return "curtain";
  if (/điều hoà|điều hòa|máy lạnh|\bac\b|air/i.test(name)) return "ac";
  if (/quạt|\bfan\b/i.test(name)) return "fan";
  if (/đèn|light|lamp/i.test(name)) return "lamp";
  return "switch";
}

type ApplianceText = {
  /** Loại hiển thị ở trang chi tiết. */
  label: string;
  on: string;
  off: string;
  /** Động từ cho nút / nhãn trợ năng: "Bật"/"Tắt", rèm là "Mở"/"Đóng". */
  turnOn: string;
  turnOff: string;
};

export const APPLIANCE_TEXT: Record<ApplianceKind, ApplianceText> = {
  lamp: { label: "Đèn", on: "Đang bật", off: "Đang tắt", turnOn: "Bật", turnOff: "Tắt" },
  fan: { label: "Quạt", on: "Đang chạy", off: "Đang tắt", turnOn: "Bật", turnOff: "Tắt" },
  curtain: { label: "Rèm cửa", on: "Đang mở", off: "Đang đóng", turnOn: "Mở", turnOff: "Đóng" },
  ac: { label: "Điều hòa", on: "Đang chạy", off: "Đang tắt", turnOn: "Bật", turnOff: "Tắt" },
  switch: { label: "Công tắc (relay)", on: "Đang bật", off: "Đang tắt", turnOn: "Bật", turnOff: "Tắt" },
};

// Điều hòa: dải nhiệt độ đặt backend chấp nhận (set_temp), bước 1 °C.
export const AC_SETPOINT_MIN = 16;
export const AC_SETPOINT_MAX = 30;
/** Điểm xuất phát khi backend chưa biết nhiệt độ đặt (null) mà khách bấm −/+. */
export const AC_SETPOINT_START = 26;

export const clampSetpoint = (value: number): number =>
  Math.min(AC_SETPOINT_MAX, Math.max(AC_SETPOINT_MIN, Math.round(value)));

/** Chỉ thiết bị backend đã gán `appliance === "ac"` mới nhận lệnh set_temp. */
export const isAirConditioner = (device: Pick<CustomerDevice, "appliance">): boolean => device.appliance === "ac";
