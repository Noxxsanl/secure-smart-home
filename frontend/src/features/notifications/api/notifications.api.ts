import { mockDelay, notificationStore } from "@/shared/mock/store";
import type { MockNotification } from "@/shared/mock/types";

export type NotificationsResponse = {
  notifications: MockNotification[];
  unread_count: number;
};

export async function fetchNotifications(role: "admin" | "operator"): Promise<NotificationsResponse> {
  const notifications = notificationStore.listForRole(role);
  return mockDelay({
    notifications,
    unread_count: notifications.filter((n) => !n.is_read).length,
  });
}

export async function markNotificationRead(id: number): Promise<void> {
  notificationStore.markRead(id);
  return mockDelay(undefined, 100);
}

export async function markAllNotificationsRead(role: "admin" | "operator"): Promise<void> {
  notificationStore.markAllRead(role);
  return mockDelay(undefined, 100);
}
