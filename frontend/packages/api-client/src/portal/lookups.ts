"use client";

import { POLL_OVERVIEW_MS, useApi } from "./client";
import { overviewKey } from "./keys";
import type { HomeOverview } from "./types";

/**
 * GET /homes/:id/overview — tổng quan nhà (thiết bị, phòng, gateway, số gợi ý…) mà
 * nhiều module cùng đọc; polling 5 s (mặc định) vì web không có WebSocket.
 * `refreshInterval = 0` khi chỉ cần đọc một lần (VD form tạo rule).
 */
export function useHomeOverview(homeId: number | null, refreshInterval = POLL_OVERVIEW_MS) {
  return useApi<HomeOverview>(homeId === null ? null : overviewKey(homeId), { refreshInterval });
}
