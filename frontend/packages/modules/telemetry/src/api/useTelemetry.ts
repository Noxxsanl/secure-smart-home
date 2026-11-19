"use client";

import { PORTAL_API, POLL_TELEMETRY_MS, useApi } from "@shh/api-client/portal";
import type { Telemetry, TelemetryRange } from "@shh/api-client/portal";

export const telemetryKey = (deviceId: number, range: TelemetryRange) =>
  `${PORTAL_API}/devices/${deviceId}/telemetry?range=${range}`;

/** Cổng khách: GET /devices/:id/telemetry?range=24h|7d — trung bình theo bucket, cũ → mới. */
export function useTelemetry(deviceId: number | null, range: TelemetryRange) {
  return useApi<Telemetry>(deviceId === null ? null : telemetryKey(deviceId, range), {
    refreshInterval: POLL_TELEMETRY_MS,
    keepPreviousData: true,
  });
}
