import useSWR from "swr";
import type { ApiDevice, ApiDeviceStatus } from "@/shared/types/api";
import api from "@/shared/api/client";

const fetcher = (url: string) => api.get<{ devices: ApiDevice[] }>(url).then((r) => r.data.devices);

export function useDeviceList() {
  // Poll mỗi 10 giây để chỉ báo online/offline luôn cập nhật
  // mà không gây tải quá mức cho server (cache heartbeat backend có độ phân giải 30 giây).
  const { data, error, isLoading, mutate } = useSWR<ApiDevice[]>(
    "/api/devices",
    fetcher,
    { refreshInterval: 10000 }
  );

  const updateStatus = async (id: number, status: ApiDeviceStatus) => {
    await api.patch(`/api/devices/${id}/status`, { status });
    // Cập nhật lạc quan: vá cache cục bộ ngay lập tức, sau đó revalidate từ server.
    // Reset fail_count về 0 khi status chuyển sang "active" để khớp với câu
    // UPDATE devices SET status = ?, fail_count = 0 của backend.
    await mutate(
      (current) =>
        current?.map((device) =>
          device.id === id
            ? {
                ...device,
                status,
                fail_count: status === "active" ? 0 : device.fail_count,
              }
            : device
        ),
      { revalidate: true }
    );
  };

  const deleteDevice = async (id: number) => {
    await api.delete(`/api/devices/${id}`);
    // Xóa khỏi cache ngay trước khi server revalidation
    await mutate((current) => current?.filter((device) => device.id !== id), {
      revalidate: true,
    });
  };

  return {
    devices: data ?? [],
    isLoading,
    isError: !!error,
    updateStatus,
    deleteDevice,
  };
}
