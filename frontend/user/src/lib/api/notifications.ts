"use client";

import { api } from "@smarthome/shared/api/http";
import { PORTAL_API, POLL_NOTIFICATIONS_MS, useApi } from "@/lib/api/client";
import type { NotificationList } from "@/lib/api/types";

export const notificationsPrefix = `${PORTAL_API}/notifications`;

/** Thông báo của tôi; có `homeId` thì chỉ của nhà đó (FR-8.4). */
export const notificationsKey = (homeId: number | null) =>
  homeId === null
    ? `${notificationsPrefix}?limit=50`
    : `${notificationsPrefix}?home_id=${homeId}&limit=50`;

export function useNotificationList(homeId: number | null) {
  return useApi<NotificationList>(notificationsKey(homeId), {
    refreshInterval: POLL_NOTIFICATIONS_MS,
    revalidateOnFocus: true,
  });
}

/** PATCH /notifications/:id/read */
export function markNotificationRead(id: number) {
  return api<void>(`${notificationsPrefix}/${id}/read`, { method: "PATCH" });
}

/** PATCH /notifications/read-all — giới hạn trong một nhà nếu có `homeId`. */
export function markAllNotificationsRead(homeId: number | null) {
  return api<void>(`${notificationsPrefix}/read-all`, {
    method: "PATCH",
    body: homeId === null ? {} : { home_id: homeId },
  });
}
