import useSWR from "swr";
import { mockDelay, customerStore, smartHomeStore } from "@/shared/mock/store";

function buildRows() {
  return customerStore.list().map((c) => ({
    ...c,
    homesCount: smartHomeStore.list().filter((h) => h.customer_id === c.id).length,
  }));
}

export function useCustomers() {
  const { data, isLoading } = useSWR("/mock/customers", () => mockDelay(buildRows()));
  return { customers: data ?? [], isLoading };
}
