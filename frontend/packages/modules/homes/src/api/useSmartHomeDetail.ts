"use client";

import { useDashboardSWR } from "@shh/api-client/dashboard";
import { smartHomeKey } from "./smartHomes.api";
import { INVALID_ROUTE_ID_ERROR } from "@shh/api-client";
import type { SmartHomeDetail } from "@shh/api-client/dashboard";

export type { SmartHomeDetail } from "@shh/api-client/dashboard";

/**
 * GET /smart-homes/:id. Operator xem nhà đã kích hoạt mà không có quyền →
 * `access.restricted = true` (dữ liệu khách hàng đã được backend lược bỏ).
 * `id = null` (đường dẫn sai) → lỗi 404 ngay, không gọi API.
 */
export function useSmartHomeDetail(id: number | null, options: { poll?: boolean } = {}) {
  const { data, error, isLoading, mutate } = useDashboardSWR<SmartHomeDetail>(
    id !== null ? smartHomeKey(id) : null,
    { refreshInterval: options.poll === false ? 0 : 10_000 }
  );
  return {
    detail: data ?? null,
    isLoading: id !== null && isLoading,
    error: id === null ? INVALID_ROUTE_ID_ERROR : error,
    refresh: () => mutate(),
  };
}
