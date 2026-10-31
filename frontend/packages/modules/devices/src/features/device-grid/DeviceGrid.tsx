"use client";

import type { CustomerDevice } from "@shh/api-client/portal";
import DeviceCard from "../../ui/DeviceCard";
import { useDevicePower } from "../../api/useDevicePower";

export type DeviceGridProps = {
  devices: CustomerDevice[];
  /** Nhà đang tạm ngưng dịch vụ → khoá mọi công tắc (409 HOME_SUSPENDED). */
  homeSuspended: boolean;
  showRoom?: boolean;
};

// Lưới thẻ thiết bị có công tắc bật/tắt (FR-5.3) — trang Tổng quan ("Điều khiển
// nhanh") và Chi tiết phòng của @shh/homes nhận qua slot do app ghép.
export default function DeviceGrid({ devices, homeSuspended, showRoom = true }: DeviceGridProps) {
  const power = useDevicePower({ homeSuspended });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {devices.map((d) => <DeviceCard key={d.id} device={d} power={power} showRoom={showRoom} />)}
    </div>
  );
}
