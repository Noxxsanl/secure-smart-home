import useSWR from "swr";
import { mockDelay, operatorAccessStore, smartHomeStore } from "@/shared/mock/store";

function buildRows() {
  return operatorAccessStore.list().map((grant) => ({
    grant,
    homeName: smartHomeStore.get(grant.home_id)?.name ?? `Home #${grant.home_id}`,
    isActive: !grant.revoked_at && new Date(grant.expires_at).getTime() > Date.now(),
  }));
}

export function useOperatorAccess() {
  const { data, isLoading, mutate } = useSWR("/mock/team/access", () => mockDelay(buildRows()));

  const grant = async (input: { operator_id: number; operator_username: string; home_id: number; reason: string; durationHours: number }) => {
    operatorAccessStore.grant(input);
    await mutate();
  };

  const revoke = async (id: number) => {
    operatorAccessStore.revoke(id);
    await mutate();
  };

  return { rows: data ?? [], isLoading, grant, revoke };
}
