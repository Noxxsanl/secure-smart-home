"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { LOG_PAGE_LIMIT, logsKey } from "@smarthome/console/api/logs.api";
import type { LogCategory, LogEntry, LogFilters, Paginated } from "@smarthome/console/api/types";

/**
 * GET /logs/:category?home_id=&severity=&from=&to=&actor=&q=&page=&limit= (FR-10.4).
 * Lọc + phân trang ở server; poll 30 s. `keepPrevious` giữ trang cũ trong lúc
 * đổi bộ lọc (đỡ nháy) — tắt khi đổi cả loại log để không hiện nhầm dữ liệu loại khác.
 */
export function useLogEntries(
  category: LogCategory,
  filters: LogFilters = {},
  options: { poll?: boolean; keepPrevious?: boolean } = {}
) {
  const { data, error, isLoading, isValidating, mutate } = useDashboardSWR<Paginated<LogEntry>>(
    logsKey(category, filters),
    {
      refreshInterval: options.poll === false ? 0 : 30_000,
      keepPreviousData: options.keepPrevious ?? true,
    }
  );

  return {
    logs: data?.items ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? filters.page ?? 1,
    limit: data?.limit ?? filters.limit ?? LOG_PAGE_LIMIT,
    isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
  };
}
