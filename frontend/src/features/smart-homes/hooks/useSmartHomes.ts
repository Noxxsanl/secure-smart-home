import useSWR from "swr";
import { mockDelay, smartHomeStore, customerStore, gatewayStore, roomStore } from "@/shared/mock/store";
import type { HomeStatus } from "@/shared/mock/types";

export type SmartHomeListRow = {
  id: number;
  name: string;
  address: string;
  package: string;
  status: HomeStatus;
  ownerName: string | null;
  gatewayOnline: boolean | null;
  roomCount: number;
};

function buildRows(): SmartHomeListRow[] {
  return smartHomeStore.list().map((home) => {
    const owner = home.customer_id ? customerStore.get(home.customer_id) : null;
    const gateway = home.gateway_id ? gatewayStore.get(home.gateway_id) : null;
    return {
      id: home.id,
      name: home.name,
      address: home.address,
      package: home.package,
      status: home.status,
      ownerName: owner?.name ?? null,
      gatewayOnline: gateway ? gateway.status === "online" : null,
      roomCount: roomStore.listByHome(home.id).length,
    };
  });
}

export function useSmartHomes() {
  const { data, isLoading, mutate } = useSWR("/mock/smart-homes", () => mockDelay(buildRows()));
  return { homes: data ?? [], isLoading, refresh: mutate };
}
