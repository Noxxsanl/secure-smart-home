import { dashApi, dashPath } from "@smarthome/console/api/client";

// §5 Notifications (staff, FR-8.5) — target_role ∈ (role của tôi, 'all').

export const NOTIFICATIONS_PREFIX = "/notifications";

export function notificationsKey(limit = 50) {
  return dashPath(NOTIFICATIONS_PREFIX, { limit });
}

export function markNotificationRead(id: number) {
  return dashApi<void>(`/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead() {
  return dashApi<void>("/notifications/read-all", { method: "PATCH" });
}
