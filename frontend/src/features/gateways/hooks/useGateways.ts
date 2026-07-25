import useSWR from "swr";
import { mockDelay, gatewayStore, smartHomeStore } from "@/shared/mock/store";

export type GatewayListRow = ReturnType<typeof gatewayStore.list>[number] & { homeName: string | null };

function buildRows(): GatewayListRow[] {
  return gatewayStore.list().map((g) => ({
    ...g,
    homeName: g.home_id ? smartHomeStore.get(g.home_id)?.name ?? null : null,
  }));
}

export function useGateways() {
  const { data, isLoading } = useSWR("/mock/gateways", () => mockDelay(buildRows()));
  return { gateways: data ?? [], isLoading };
}
