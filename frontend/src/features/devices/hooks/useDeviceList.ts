import useSWR from "swr";
import { mockDelay, deviceStore } from "@/shared/mock/store";
import type { ApiDeviceStatus } from "@/shared/types/api";
import type { MockDevice } from "@/shared/mock/types";

export function useDeviceList() {
  const { data, error, isLoading, mutate } = useSWR<MockDevice[]>(
    "/mock/devices",
    () => mockDelay(deviceStore.list())
  );

  const updateStatus = async (id: number, status: ApiDeviceStatus) => {
    deviceStore.updateStatus(id, status);
    await mutate();
  };

  const deleteDevice = async (id: number) => {
    deviceStore.delete(id);
    await mutate();
  };

  return {
    devices: data ?? [],
    isLoading,
    isError: !!error,
    updateStatus,
    deleteDevice,
  };
}
