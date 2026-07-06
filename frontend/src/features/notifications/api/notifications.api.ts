import api from "@/shared/api/client";
import type { NotificationsResponse } from "@/shared/types/api";

export async function fetchNotifications(): Promise<NotificationsResponse> {
  const { data } = await api.get<NotificationsResponse>("/api/notifications");
  return data;
}

export async function markNotificationRead(id: number): Promise<void> {
  await api.patch<void>(`/api/notifications/${id}/read`, {});
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch<void>("/api/notifications/read-all", {});
}
