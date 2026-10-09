"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { adminStatsKey } from "@smarthome/console/api/stats.api";
import type { AdminStats } from "@smarthome/console/api/types";

/** GET /api/dashboard/stats/admin — poll 10 s. */
export function useAdminDashboard() {
  const { data, error, isLoading, mutate } = useDashboardSWR<AdminStats>(adminStatsKey(), {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
  return { stats: data ?? null, isLoading, error, refresh: () => mutate() };
}
