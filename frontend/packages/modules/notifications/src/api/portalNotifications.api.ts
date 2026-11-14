"use client";

import { api } from "@shh/api-client";
import { POLL_NOTIFICATIONS_MS, notificationsPrefix, useApi } from "@shh/api-client/portal";
import type { NotificationList } from "@shh/api-client/portal";

/** Thông báo của tôi; có `homeId` thì chỉ của nhà đó (FR-8.4). */
export const notificationsKey = (homeId: number | null) =>
  homeId === null
    ? `${notificationsPrefix}?limit=50`
    : `${notificationsPrefix}?home_id=${homeId}&limit=50`;

export function useNotificationList(homeId: number | null) {
  return useApi<NotificationList>(notificationsKey(homeId), {
    refreshInterval: POLL_NOTIFICATIONS_MS,
    // SWR mặc định ngừng poll khi tab ẩn; popup hệ điều hành (useAnnounceNewNotifications) cần đúng lúc đó,
    // nên chỉ danh sách thông báo nhà được poll tiếp khi tab ẩn (15 s/lần, nhẹ).
    refreshWhenHidden: true,
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
