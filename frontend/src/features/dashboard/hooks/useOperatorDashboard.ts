import useSWR from "swr";
import { mockDelay, computeOperatorDashboard } from "@/shared/mock/store";

export function useOperatorDashboard() {
  const { data, isLoading } = useSWR(
    "/mock/dashboard/operator",
    () => mockDelay(computeOperatorDashboard(), 200),
    { refreshInterval: 10000 }
  );

  return { stats: data ?? null, isLoading };
}
