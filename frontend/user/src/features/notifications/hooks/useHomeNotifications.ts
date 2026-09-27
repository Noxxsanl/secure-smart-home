"use client";

import {
  listHomeNotifications, markAllNotificationsRead, markNotificationRead,
} from "@smarthome/shared/mock/portal";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import { useHomeQuery } from "@/lib/portal-swr";

export function useHomeNotifications() {
  const { customerId, current } = useCurrentHome();
  const { data, isLoading, mutate } = useHomeQuery("notifications", listHomeNotifications, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });

  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unread_count ?? 0,
    isLoading,
    markRead: async (id: number) => {
      await markNotificationRead(customerId, id);
      await mutate();
    },
    markAllRead: async () => {
      if (!current) return;
      await markAllNotificationsRead(customerId, current.home.id);
      await mutate();
    },
  };
}
