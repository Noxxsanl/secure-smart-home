"use client";

import { dashPath, useDashboardSWR } from "@shh/api-client/dashboard";
import type { Telemetry, TelemetryRange } from "@shh/api-client/dashboard";

/** Operator + nhà đã kích hoạt cần quyền truy cập (403 ACCESS_GRANT_REQUIRED). */
export function deviceTelemetryKey(id: number, range: TelemetryRange) {
  return dashPath(`/devices/${id}/telemetry`, { range });
}

/**
 * Console: GET /devices/:id/telemetry?range=24h|7d — trung bình theo bucket (5 phút / 1 giờ),
 * cũ → mới. Operator xem nhà đã kích hoạt mà chưa có quyền → lỗi ACCESS_GRANT_REQUIRED
 * (trang hiển thị hướng dẫn xin quyền, không retry).
 * `enabled = false` (không phải cảm biến) → không gọi API.
 */
export function useSensorData(id: number | null, range: TelemetryRange, enabled = true) {
  const { data, error, isLoading } = useDashboardSWR<Telemetry>(
    enabled && id !== null ? deviceTelemetryKey(id, range) : null,
    { refreshInterval: 30_000 }
  );
  return {
    points: data?.points ?? [],
    latest: data?.latest ?? null,
    bucketSeconds: data?.bucket_seconds ?? null,
    isLoading,
    error,
  };
}
