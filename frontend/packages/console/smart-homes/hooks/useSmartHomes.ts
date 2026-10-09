"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { smartHomesKey } from "@smarthome/console/api/smartHomes.api";
import type { HomeStatus, SmartHomeRow } from "@smarthome/console/api/types";

export type SmartHomeListRow = SmartHomeRow;

/** GET /smart-homes?status=&q= — lọc ở server, poll 10 s (danh sách console). */
export function useSmartHomes(filters: { status?: HomeStatus | null; q?: string } = {}, options: { poll?: boolean } = {}) {
  const { data, error, isLoading, isValidating, mutate } = useDashboardSWR<SmartHomeRow[]>(
    smartHomesKey(filters),
    { refreshInterval: options.poll === false ? 0 : 10_000, keepPreviousData: true }
  );
  return {
    homes: data ?? [],
    isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
  };
}
