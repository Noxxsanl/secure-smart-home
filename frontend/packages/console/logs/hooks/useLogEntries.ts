import useSWR from "swr";
import { mockDelay, logStore } from "@smarthome/shared/mock/store";
import type { LogCategory } from "@smarthome/shared/mock/types";

export function useLogEntries(category: LogCategory) {
  const { data, isLoading, mutate } = useSWR(
    `/mock/logs/${category}`,
    () => mockDelay(logStore.listByCategory(category)),
    { refreshInterval: 30000 }
  );

  return { logs: data ?? [], isLoading, refresh: mutate };
}
