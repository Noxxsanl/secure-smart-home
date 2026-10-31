"use client";

import { useDashboardSWR } from "@shh/api-client/dashboard";
import type { ConsoleBadges } from "@shh/api-client/dashboard";
import { badgesKey } from "./stats.api";

/** Khoá huy hiệu dùng trong nav config của app admin/operator. */
export type ConsoleBadgeKey = "unclaimedHomes" | "offlineGateways" | "otaInProgress" | "unreadNotifications";

/**
 * GET /stats/badges — poll 15 s; lỗi tạm thời giữ số cũ (keepPreviousData).
 * `unreadCount` là số chưa đọc của danh sách thông báo (cập nhật ngay khi đánh dấu
 * đã đọc) — chuông và huy hiệu cùng nguồn đếm, ưu tiên số đó.
 */
export function useConsoleBadges(unreadCount: number): Record<ConsoleBadgeKey, number> {
  const { data: stats } = useDashboardSWR<ConsoleBadges>(badgesKey(), {
    refreshInterval: 15_000,
    keepPreviousData: true,
  });
  return {
    unclaimedHomes: stats?.unclaimed_homes ?? 0,
    offlineGateways: stats?.offline_gateways ?? 0,
    otaInProgress: stats?.ota_in_progress ?? 0,
    unreadNotifications: unreadCount || stats?.unread_notifications || 0,
  };
}
