"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { gatewayKey } from "@smarthome/console/api/gateways.api";
import { INVALID_ROUTE_ID_ERROR } from "@smarthome/console/lib/ids";
import type { GatewayDetail } from "@smarthome/console/api/types";

/**
 * GET /gateways/:id → gateway + nhà + các node + log gateway/provision (50 mới nhất).
 * Poll 5 s để thấy gateway online/offline sau restart. `id = null` → 404 ngay.
 */
export function useGatewayDetail(id: number | null) {
  const { data, error, isLoading, mutate } = useDashboardSWR<GatewayDetail>(
    id !== null ? gatewayKey(id) : null,
    { refreshInterval: 5_000 }
  );
  return {
    detail: data ?? null,
    isLoading: id !== null && isLoading,
    error: id === null ? INVALID_ROUTE_ID_ERROR : error,
    refresh: () => mutate(),
  };
}
