import useSWR from "swr";
import { mockDelay, computeAdminDashboard } from "@smarthome/shared/mock/store";

export function useAdminDashboard() {
  const { data, isLoading } = useSWR(
    "/mock/dashboard/admin",
    () => mockDelay(computeAdminDashboard(), 200),
    { refreshInterval: 10000 }
  );

  return { stats: data ?? null, isLoading };
}
