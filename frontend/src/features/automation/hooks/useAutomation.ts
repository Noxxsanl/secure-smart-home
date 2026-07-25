import useSWR from "swr";
import { mockDelay, automationStore, roomStore, deviceStore, smartHomeStore } from "@/shared/mock/store";
import type { AutomationRule } from "@/shared/mock/types";

function buildRows() {
  return automationStore.list().map((rule) => ({
    rule,
    homeName: smartHomeStore.get(rule.home_id)?.name ?? `Home #${rule.home_id}`,
    roomName: roomStore.get(rule.trigger_room_id)?.name ?? "—",
    deviceName: deviceStore.get(rule.action_device_id)?.device_name ?? "—",
  }));
}

export function useAutomation() {
  const { data, isLoading, mutate } = useSWR("/mock/automation", () => mockDelay(buildRows()));

  const toggle = async (id: number) => {
    automationStore.toggle(id);
    await mutate();
  };

  const remove = async (id: number) => {
    automationStore.delete(id);
    await mutate();
  };

  const create = async (rule: Omit<AutomationRule, "id" | "enabled">) => {
    automationStore.create(rule);
    await mutate();
  };

  return { rows: data ?? [], isLoading, toggle, remove, create };
}
