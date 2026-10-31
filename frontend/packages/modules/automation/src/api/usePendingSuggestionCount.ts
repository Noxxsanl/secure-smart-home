"use client";

import { POLL_NOTIFICATIONS_MS, useHomeOverview } from "@shh/api-client/portal";
import { useCurrentHome } from "@shh/auth";

/** Số gợi ý tự động hoá đang chờ của nhà đang chọn (huy hiệu sidebar). GUEST không xem được gợi ý → 0. */
export function usePendingSuggestionCount(): number {
  const { current, permissions } = useCurrentHome();
  const { data } = useHomeOverview(current?.home.id ?? null, POLL_NOTIFICATIONS_MS);
  return permissions?.canViewAutomation ? (data?.pending_suggestions ?? 0) : 0;
}
