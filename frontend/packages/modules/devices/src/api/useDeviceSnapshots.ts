"use client";

import { POLL_SNAPSHOTS_MS, deviceSnapshotsKey, useApi } from "@shh/api-client/portal";
import type { CameraSnapshotList } from "@shh/api-client/portal";

/** Số ảnh tối đa trong dải thumbnail. */
export const SNAPSHOT_LIMIT = 20;

/** Cổng khách: GET /devices/:id/snapshots?limit=20 — làm mới mỗi 15 s, ảnh mới nhất trước. */
export function useDeviceSnapshots(deviceId: number | null) {
  return useApi<CameraSnapshotList>(deviceId === null ? null : deviceSnapshotsKey(deviceId, SNAPSHOT_LIMIT), {
    refreshInterval: POLL_SNAPSHOTS_MS,
    keepPreviousData: true,
  });
}
