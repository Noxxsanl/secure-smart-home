"use client";

import { useDashboardSWR } from "@shh/api-client/dashboard";
import { adminStatsKey } from "./stats.api";
import type { AdminStats } from "@shh/api-client/dashboard";

/** GET /api/dashboard/stats/admin — poll 10 s. */
export function useAdminDashboard() {
  const { data, error, isLoading, mutate } = useDashboardSWR<AdminStats>(adminStatsKey(), {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
  return { stats: data ?? null, isLoading, error, refresh: () => mutate() };
}
