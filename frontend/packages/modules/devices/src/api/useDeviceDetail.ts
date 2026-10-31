"use client";

import { deviceKey } from "@shh/api-client/portal";
import { useDashboardSWR } from "@shh/api-client/dashboard";
import { INVALID_ROUTE_ID_ERROR } from "@shh/api-client";
import type { DeviceDetail } from "@shh/api-client/dashboard";

/**
 * GET /devices/:id → thiết bị + các lệnh gần đây (Device Command Log, FR-5.9).
 * Poll 5 s như các trang theo dõi thiết bị. `id = null` (đường dẫn sai) → 404 ngay.
 */
export function useDeviceDetail(id: number | null) {
  const { data, error, isLoading, mutate } = useDashboardSWR<DeviceDetail>(
    id !== null ? deviceKey(id) : null,
    { refreshInterval: 5_000 }
  );
  return {
    device: data?.device ?? null,
    recentCommands: data?.recent_commands ?? [],
    isLoading: id !== null && isLoading,
    error: id === null ? INVALID_ROUTE_ID_ERROR : error,
    refresh: () => mutate(),
  };
}
