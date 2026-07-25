import useSWR from "swr";
import { mockDelay, staffStore } from "@/shared/mock/store";
import type { StaffAccount } from "@/shared/mock/types";

export function useTeam() {
  const { data, error, isLoading, mutate } = useSWR<StaffAccount[]>(
    "/mock/team",
    () => mockDelay(staffStore.list())
  );

  // `password` is collected by the create-member form to match the real
  // account-creation UX, but the mock store has no auth of its own to set it on.
  const createMember = async (username: string, password: string, role: "admin" | "operator" = "operator") => {
    void password;
    staffStore.create(username, role);
    await mutate();
  };

  const deleteMember = async (id: number) => {
    staffStore.delete(id);
    await mutate();
  };

  return {
    members: data ?? [],
    isLoading,
    isError: !!error,
    createMember,
    deleteMember,
  };
}
