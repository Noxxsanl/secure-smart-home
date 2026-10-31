"use client";

import { HomeDeviceDetailPage } from "@shh/devices";
import { HomeDeviceTelemetry } from "@shh/telemetry";

// Thiết bị (@shh/devices) + biểu đồ cảm biến nhiệt/ẩm (@shh/telemetry).
export default function Page() {
  return <HomeDeviceDetailPage renderTelemetry={(p) => <HomeDeviceTelemetry {...p} />} />;
}
