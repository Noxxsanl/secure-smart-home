"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { deploymentsKey, firmwareKey } from "@smarthome/console/api/ota.api";
import type { FirmwareVersion, OtaDeployment } from "@smarthome/console/api/types";

/** Poll nhanh khi có đợt triển khai đang chạy để thấy tiến độ thiết bị báo về (FR-9.4). */
const POLL_ACTIVE_MS = 5_000;
const POLL_IDLE_MS = 10_000;

/**
 * GET /firmware + GET /ota/deployments. Trong lúc có deployment `in_progress` thì poll
 * mỗi 5 giây, ngược lại 10 giây.
 */
export function useOta() {
  const versions = useDashboardSWR<FirmwareVersion[]>(firmwareKey(), {
    refreshInterval: POLL_IDLE_MS,
    keepPreviousData: true,
  });
  const deployments = useDashboardSWR<OtaDeployment[]>(deploymentsKey(), {
    refreshInterval: (latest) => (latest?.some((d) => d.status === "in_progress") ? POLL_ACTIVE_MS : POLL_IDLE_MS),
    keepPreviousData: true,
  });

  const deploymentList = deployments.data ?? [];

  return {
    firmware: versions.data ?? [],
    deployments: deploymentList,
    hasInProgress: deploymentList.some((d) => d.status === "in_progress"),
    isLoading: versions.isLoading || deployments.isLoading,
    error: versions.error ?? deployments.error,
    refresh: () => Promise.all([versions.mutate(), deployments.mutate()]),
  };
}
