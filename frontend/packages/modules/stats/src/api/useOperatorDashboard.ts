"use client";

import { useDashboardSWR } from "@shh/api-client/dashboard";
import { operatorStatsKey } from "./stats.api";
import type { OperatorStats } from "@shh/api-client/dashboard";

/** GET /api/dashboard/stats/operator — poll 10 s. */
export function useOperatorDashboard() {
  const { data, error, isLoading, mutate } = useDashboardSWR<OperatorStats>(operatorStatsKey(), {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
  return { stats: data ?? null, isLoading, error, refresh: () => mutate() };
}
