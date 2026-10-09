"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { customerKey } from "@smarthome/console/api/customers.api";
import { INVALID_ROUTE_ID_ERROR } from "@smarthome/console/lib/ids";
import type { CustomerDetail } from "@smarthome/console/api/types";

/**
 * GET /customers/:id → khách hàng + nhà đã mua + bảo hành + lịch sử activation.
 * `id = null` (đường dẫn sai) → lỗi 404 ngay, không gọi API.
 */
export function useCustomerDetail(id: number | null) {
  const { data, error, isLoading, mutate } = useDashboardSWR<CustomerDetail>(
    id !== null ? customerKey(id) : null,
    { refreshInterval: 10_000 }
  );
  return {
    detail: data ?? null,
    isLoading: id !== null && isLoading,
    error: id === null ? INVALID_ROUTE_ID_ERROR : error,
    refresh: () => mutate(),
  };
}
