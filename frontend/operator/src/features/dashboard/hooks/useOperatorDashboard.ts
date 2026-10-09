"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { operatorStatsKey } from "@smarthome/console/api/stats.api";
import type { OperatorStats } from "@smarthome/console/api/types";

/** GET /api/dashboard/stats/operator — poll 10 s. */
export function useOperatorDashboard() {
  const { data, error, isLoading, mutate } = useDashboardSWR<OperatorStats>(operatorStatsKey(), {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
  return { stats: data ?? null, isLoading, error, refresh: () => mutate() };
}
