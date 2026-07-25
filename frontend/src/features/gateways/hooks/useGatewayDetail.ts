import useSWR from "swr";
import { mockDelay, gatewayStore, smartHomeStore, logStore } from "@/shared/mock/store";

function buildDetail(id: number) {
  const gateway = gatewayStore.get(id);
  if (!gateway) return null;
  return {
    gateway,
    home: gateway.home_id ? smartHomeStore.get(gateway.home_id) : null,
    provisionLogs: logStore.listByCategory("provision").filter((l) => l.gateway_uid === gateway.uid),
  };
}

export function useGatewayDetail(id: number) {
  const { data, isLoading, mutate } = useSWR(
    Number.isFinite(id) ? `/mock/gateways/${id}` : null,
    () => mockDelay(buildDetail(id))
  );
  return { detail: data ?? null, isLoading, refresh: mutate };
}
