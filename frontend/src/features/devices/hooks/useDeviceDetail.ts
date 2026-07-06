import useSWR from "swr";
import type { ApiDevice, ApiDeviceDetail, ApiDeviceStatus, ApiSensorData } from "@/shared/types/api";
import api from "@/shared/api/client";

type RawDeviceDetail = { device: ApiDevice; recent_data: ApiSensorData[] };

const fetcher = (url: string) =>
  api.get<RawDeviceDetail>(url).then((r) => ({
    ...r.data.device,
    recent_data: r.data.recent_data,
  }));

export function useDeviceDetail(id: string | number) {
  const { data, error, isLoading, mutate } = useSWR<ApiDeviceDetail>(
    `/api/devices/${id}`,
    fetcher,
    { refreshInterval: 10000 }
  );

  const updateStatus = async (status: ApiDeviceStatus) => {
    await api.patch(`/api/devices/${id}/status`, { status });
    mutate();
  };

  const deleteDevice = async () => {
    await api.delete(`/api/devices/${id}`);
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
