"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { devicesKey } from "@smarthome/console/api/devices.api";
import type { ConsoleDevice, DeviceListFilters } from "@smarthome/console/api/types";

/**
 * GET /devices?home_id=&category=&status=&q=&include_gateways= — lọc ở server, poll 10 s.
 * Mặc định chỉ trả thiết bị node; `include_gateways` thêm cả hàng Gateway.
 */
export function useDeviceList(filters: DeviceListFilters = {}) {
  const { data, error, isLoading, isValidating, mutate } = useDashboardSWR<ConsoleDevice[]>(
    devicesKey(filters),
    { refreshInterval: 10_000, keepPreviousData: true }
  );
  return {
    devices: data ?? [],
    isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
  };
}
