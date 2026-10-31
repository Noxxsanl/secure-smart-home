"use client";

import { useDashboardSWR } from "@shh/api-client/dashboard";
import { simulatorStatusKey } from "./simulator.api";
import type { SimulatorStatus } from "@shh/api-client/dashboard";

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
