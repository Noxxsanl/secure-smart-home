import { CameraOff, DoorClosed, DoorOpen, Droplets, Thermometer } from "lucide-react";
import type { CustomerDevice } from "@/lib/api/types";
import { formatHumidity, formatTemperature } from "@/lib/format";

// Giá trị hiện tại của thiết bị không phải relay: cảm biến nhiệt/ẩm, cảm biến
// cửa (mở/đóng từ latest.door_open), camera (chưa hỗ trợ xem trực tiếp).
export default function DeviceReading({ device, size = "sm" }: { device: CustomerDevice; size?: "sm" | "lg" }) {
  const text = size === "lg" ? "text-base" : "text-xs";
  const icon = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";

  if (device.category === "sensor") {
    return (
      <span className={`inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-700 dark:text-slate-300 ${text}`}>
        <span className="inline-flex items-center gap-1">
          <Thermometer className={`${icon} text-critical`} />
          {formatTemperature(device.latest?.temperature)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Droplets className={`${icon} text-info`} />
          {formatHumidity(device.latest?.humidity)}
        </span>
      </span>
    );
  }

  if (device.category === "door_contact") {
    const open = device.latest?.door_open;
    if (open === null || open === undefined) {
      return <span className={`text-gray-400 dark:text-slate-500 ${text}`}>Chưa có dữ liệu cửa</span>;
    }
    return open ? (
      <span className={`inline-flex items-center gap-1 font-semibold text-warning ${text}`}>
        <DoorOpen className={icon} /> Cửa đang mở
      </span>
    ) : (
      <span className={`inline-flex items-center gap-1 font-medium text-success ${text}`}>
        <DoorClosed className={icon} /> Cửa đang đóng
      </span>
    );
  }

  if (device.category === "camera") {
    return (
      <span className={`inline-flex items-center gap-1 text-gray-400 dark:text-slate-500 ${text}`}>
        <CameraOff className={icon} /> Chưa hỗ trợ xem trực tiếp
      </span>
    );
  }

  return null;
}
