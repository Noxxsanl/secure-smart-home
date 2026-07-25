import useSWR from "swr";
import { mockDelay, customerStore, smartHomeStore, warrantyStore, activationStore } from "@/shared/mock/store";

function buildDetail(id: number) {
  const customer = customerStore.get(id);
  if (!customer) return null;
  const homes = smartHomeStore.list().filter((h) => h.customer_id === id);
  const warranties = homes.flatMap((h) => warrantyStore.listByHome(h.id));
  return {
    customer,
    homes,
    warranties,
    activations: activationStore.listByCustomer(id),
  };
}

export function useCustomerDetail(id: number) {
  const { data, isLoading } = useSWR(
    Number.isFinite(id) ? `/mock/customers/${id}` : null,
    () => mockDelay(buildDetail(id))
  );
  return { detail: data ?? null, isLoading };
}
