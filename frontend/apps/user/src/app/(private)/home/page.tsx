"use client";

import { HomeOverviewPage } from "@shh/homes";
import { DeviceGrid } from "@shh/devices";

// Tổng quan nhà (@shh/homes) + lưới "Điều khiển nhanh" (@shh/devices).
export default function Page() {
  return <HomeOverviewPage renderDevices={(p) => <DeviceGrid {...p} />} />;
}
