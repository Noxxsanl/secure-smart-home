import useSWR from "swr";
import { mockDelay, generateSensorData } from "@/shared/mock/store";

export function useSensorData(id: string | number | null) {
  const numericId = id === null ? null : Number(id);
  const { data, error, isLoading } = useSWR(
    numericId !== null ? `/mock/devices/${numericId}/data` : null,
    () => mockDelay(generateSensorData(numericId as number))
  );

  return {
    sensorData: data ?? [],
    isLoading,
    isError: !!error,
  };
}
