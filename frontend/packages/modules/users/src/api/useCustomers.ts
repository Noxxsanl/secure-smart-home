"use client";

import { useDashboardSWR } from "@shh/api-client/dashboard";
import { customersKey } from "./customers.api";
import type { Customer } from "@shh/api-client/dashboard";

/** GET /customers?q= — `q` khớp tên / User ID / email / SĐT (lọc ở server), poll 10 s. */
export function useCustomers(q = "") {
  const { data, error, isLoading, isValidating, mutate } = useDashboardSWR<Customer[]>(
    customersKey(q),
    { refreshInterval: 10_000, keepPreviousData: true }
  );
  return {
    customers: data ?? [],
    isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
  };
}
