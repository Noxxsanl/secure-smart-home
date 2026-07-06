import useSWR from "swr";
import type { DashboardStats } from "@/shared/types/api";
import api from "@/shared/api/client";

const fetcher = (url: string) => api.get<DashboardStats>(url).then((r) => r.data);

export function useDashboardStats() {
  const { data, error, isLoading } = useSWR<DashboardStats>(
    "/api/dashboard/stats",
    fetcher,
    { refreshInterval: 10000 }
  );

  return {
    stats: data ?? null,
    isLoading,
    isError: !!error,
  };
}
