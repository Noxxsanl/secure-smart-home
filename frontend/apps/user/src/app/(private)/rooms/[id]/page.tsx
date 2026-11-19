"use client";

import { RoomDetailPage } from "@shh/homes";
import { DeviceGrid } from "@shh/devices";

// Phòng (@shh/homes) + lưới thiết bị có công tắc (@shh/devices).
export default function Page() {
  return <RoomDetailPage renderDevices={(p) => <DeviceGrid {...p} />} />;
}
