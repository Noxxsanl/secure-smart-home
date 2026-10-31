"use client";

import { DeviceDetailPage } from "@shh/devices";
import { DeviceTelemetryPanel } from "@shh/telemetry";

// Thiết bị (@shh/devices) + khối số đo/trạng thái cảm biến (@shh/telemetry).
export default function Page() {
  return <DeviceDetailPage renderTelemetry={(p) => <DeviceTelemetryPanel {...p} />} />;
}
