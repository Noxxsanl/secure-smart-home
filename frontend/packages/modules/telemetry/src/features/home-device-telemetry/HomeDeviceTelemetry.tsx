"use client";

import { useState } from "react";
import { portalErrorMessage } from "@shh/api-client/portal";
import type { TelemetryRange } from "@shh/api-client/portal";
import TelemetryChart from "../../ui/TelemetryChart";
import { useTelemetry } from "../../api/useTelemetry";

export type HomeDeviceTelemetryProps = { deviceId: number; deviceName: string };

// Cổng khách: GET /devices/:id/telemetry?range=24h|7d của cảm biến nhiệt/ẩm.
export default function HomeDeviceTelemetry({ deviceId, deviceName }: HomeDeviceTelemetryProps) {
  const [range, setRange] = useState<TelemetryRange>("24h");
  const { data, error } = useTelemetry(deviceId, range);
  // keepPreviousData giữ số liệu của khoảng cũ khi đổi 24h ↔ 7d — chỉ vẽ khi đúng khoảng đang chọn.
  const telemetry = data?.range === range ? data : undefined;

  return (
    <TelemetryChart
      points={telemetry?.points ?? []}
      range={range}
      onRangeChange={setRange}
      isLoading={!telemetry && !error}
      errorMessage={!telemetry && error ? portalErrorMessage(error) : null}
      title={deviceName}
    />
  );
}
