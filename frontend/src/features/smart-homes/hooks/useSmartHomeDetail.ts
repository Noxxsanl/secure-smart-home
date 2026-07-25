import useSWR from "swr";
import {
  mockDelay, smartHomeStore, customerStore, gatewayStore, roomStore,
  homeMemberStore, homeTimelineStore, deviceStore, automationStore, cameraStore,
} from "@/shared/mock/store";

function buildDetail(id: number) {
  const home = smartHomeStore.get(id);
  if (!home) return null;
  return {
    home,
    owner: home.customer_id ? customerStore.get(home.customer_id) : null,
    gateway: home.gateway_id ? gatewayStore.get(home.gateway_id) : null,
    rooms: roomStore.listByHome(id),
    members: homeMemberStore.listByHome(id),
    timeline: homeTimelineStore.listByHome(id),
    devices: deviceStore.listByHome(id),
    automationRules: automationStore.listByHome(id),
    cameras: cameraStore.listByHome(id),
  };
}

export type SmartHomeDetail = NonNullable<ReturnType<typeof buildDetail>>;

export function useSmartHomeDetail(id: number) {
  const { data, isLoading, mutate } = useSWR(
    Number.isFinite(id) ? `/mock/smart-homes/${id}` : null,
    () => mockDelay(buildDetail(id))
  );
  return { detail: data ?? null, isLoading, refresh: mutate };
}
