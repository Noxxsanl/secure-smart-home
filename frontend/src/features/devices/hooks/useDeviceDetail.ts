import useSWR from "swr";
import { mockDelay, deviceStore } from "@/shared/mock/store";
import type { ApiDeviceStatus } from "@/shared/types/api";

export function useDeviceDetail(id: string | number) {
  const numericId = Number(id);
  const { data, error, isLoading, mutate } = useSWR(
    Number.isFinite(numericId) ? `/mock/devices/${numericId}` : null,
    () => mockDelay(deviceStore.get(numericId))
  );

  const updateStatus = async (status: ApiDeviceStatus) => {
    deviceStore.updateStatus(numericId, status);
    await mutate();
  };

  const deleteDevice = async () => {
    deviceStore.delete(numericId);
  };

  return {
    device: data ?? null,
    isLoading,
    isError: !!error,
    mutate,
    updateStatus,
    deleteDevice,
  };
}
