"use client";

import useSWR from "swr";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/features/notifications/api/notifications.api";
import type { MockNotification } from "@/shared/mock/types";

export function useNotifications() {
  const { user } = useAuth();
  const role = user?.role === "operator" ? "operator" : "admin";

  const { data, mutate } = useSWR(
    user ? `/mock/notifications/${role}` : null,
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
    isAdmin: role === "admin",
  };
}
