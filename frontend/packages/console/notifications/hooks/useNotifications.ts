"use client";

import useSWR from "swr";
import { useStaffRole } from "@smarthome/console/auth/usePermissions";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@smarthome/console/notifications/api/notifications.api";
import type { MockNotification } from "@smarthome/shared/mock/types";

export function useNotifications() {
  const role = useStaffRole();

  const { data, mutate } = useSWR(
    `/mock/notifications/${role}`,
    () => fetchNotifications(role),
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );

  const markRead = async (id: number) => {
    await markNotificationRead(id);
    await mutate();
  };

  const markAllRead = async () => {
    await markAllNotificationsRead(role);
    await mutate();
  };

  return {
    notifications: (data?.notifications ?? []) as MockNotification[],
    unreadCount: data?.unread_count ?? 0,
    markRead,
    markAllRead,
  };
}
