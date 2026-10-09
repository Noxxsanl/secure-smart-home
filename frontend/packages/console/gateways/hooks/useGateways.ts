"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { gatewaysKey } from "@smarthome/console/api/gateways.api";
import type { Gateway } from "@smarthome/console/api/types";

/** GET /gateways — danh sách Gateway toàn hệ thống (FR-9.1), poll 10 s. */
export function useGateways() {
  const { data, error, isLoading, isValidating, mutate } = useDashboardSWR<Gateway[]>(gatewaysKey(), {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
  return {
    gateways: data ?? [],
    isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
  };
}
