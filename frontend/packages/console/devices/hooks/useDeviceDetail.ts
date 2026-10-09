"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { deviceKey } from "@smarthome/console/api/devices.api";
import { INVALID_ROUTE_ID_ERROR } from "@smarthome/console/lib/ids";
import type { DeviceDetail } from "@smarthome/console/api/types";

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
