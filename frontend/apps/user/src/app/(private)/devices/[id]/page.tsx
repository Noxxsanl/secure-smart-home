"use client";

import { HomeCameraLive, HomeCameraSnapshots, HomeDeviceDetailPage } from "@shh/devices";
import { HomeDeviceTelemetry } from "@shh/telemetry";

// Thiết bị (@shh/devices) + biểu đồ cảm biến nhiệt/ẩm (@shh/telemetry) + camera: xem trực tiếp rồi ảnh đã chụp (@shh/devices).
export default function Page() {
  return (
    <HomeDeviceDetailPage
      renderTelemetry={(p) => <HomeDeviceTelemetry {...p} />}
      renderCamera={(p) => (
        <>
          <HomeCameraLive {...p} />
          <HomeCameraSnapshots {...p} />
        </>
      )}
    />
  );
}
