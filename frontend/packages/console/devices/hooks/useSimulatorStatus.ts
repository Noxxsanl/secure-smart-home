"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { simulatorStatusKey } from "@smarthome/console/api/simulator.api";
import type { SimulatorStatus } from "@smarthome/console/api/types";

/**
 * GET /simulator/status — backend có đang bật bộ mô phỏng thiết bị không (môi trường
 * demo/dev). Lỗi hoặc chưa tải xong → coi như tắt để không hiện nút điều khiển giả.
 */
export function useSimulatorEnabled(): boolean {
  const { data } = useDashboardSWR<SimulatorStatus>(simulatorStatusKey(), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  });
  return data?.enabled === true;
}
