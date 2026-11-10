"use client";

import { HomeCameraSnapshots, HomeDeviceDetailPage } from "@shh/devices";
import { HomeDeviceTelemetry } from "@shh/telemetry";

// Thiết bị (@shh/devices) + biểu đồ cảm biến nhiệt/ẩm (@shh/telemetry) + ảnh camera (@shh/devices).
export default function Page() {
  return (
    <HomeDeviceDetailPage
      renderTelemetry={(p) => <HomeDeviceTelemetry {...p} />}
      renderCamera={(p) => <HomeCameraSnapshots {...p} />}
    />
  );
}
