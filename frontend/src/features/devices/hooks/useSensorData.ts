import useSWR from "swr";
import type { ApiSensorData } from "@/shared/types/api";
import api from "@/shared/api/client";

// Endpoint phân trang bọc dữ liệu trong { data: [...] } nhưng định dạng response cũ
// trả về mảng thẳng. Fetcher chuẩn hóa cả hai dạng.
type RawResponse = { data: ApiSensorData[] } | ApiSensorData[];

const fetcher = (url: string) =>
  api.get<RawResponse>(url).then((r) => {
    const d = r.data;
    return Array.isArray(d) ? d : (d.data ?? []);
  });

export function useSensorData(id: string | number | null) {
  // Truyền null làm key SWR để vô hiệu hóa fetching khi chưa chọn thiết bị
  const { data, error, isLoading } = useSWR<ApiSensorData[]>(
    id !== null ? `/api/devices/${id}/data?limit=200` : null,
    fetcher,
    { refreshInterval: 10000 }
  );

  return {
    sensorData: data ?? [],
    isLoading,
    isError: !!error,
  };
}
