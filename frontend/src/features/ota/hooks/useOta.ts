import useSWR from "swr";
import { mockDelay, firmwareStore } from "@/shared/mock/store";

function buildData() {
  const deployments = firmwareStore.listDeployments();
  const versions = firmwareStore.list();
  return {
    versions,
    rows: versions.map((fw) => ({
      firmware: fw,
      deployment: deployments.find((d) => d.firmware_id === fw.id) ?? null,
    })),
  };
}

export function useOta() {
  const { data, isLoading, mutate } = useSWR("/mock/ota", () => mockDelay(buildData()));
  return { versions: data?.versions ?? [], rows: data?.rows ?? [], isLoading, refresh: mutate };
}
