import api from "@/shared/api/client";
import type { ApiDevice, ApiDeviceStatus, RegisterDeviceResponse } from "@/shared/types/api";

export async function fetchDevices(): Promise<ApiDevice[]> {
  const { data } = await api.get<{ devices: ApiDevice[] }>("/api/devices");
  return data.devices;
}

export async function updateDeviceStatus(id: number, status: ApiDeviceStatus): Promise<void> {
  await api.patch(`/api/devices/${id}/status`, { status });
}

export async function deleteDevice(id: number): Promise<void> {
  await api.delete(`/api/devices/${id}`);
}

export async function registerDevice(payload: {
  device_name: string;
  device_type: "sensor" | "gateway";
  location?: string;
}): Promise<RegisterDeviceResponse> {
  const { data } = await api.post<RegisterDeviceResponse>("/api/devices/register", payload);
  return data;
}
