"use client";

import { useDashboardSWR, revalidateDashboard } from "@shh/api-client/dashboard";
import {
  markAllNotificationsRead, markNotificationRead, notificationsKey, NOTIFICATIONS_PREFIX,
} from "./notifications.api";
import type { StaffNotification, StaffNotificationsResponse } from "@shh/api-client/dashboard";

// Thông báo staff (FR-8.5): target_role ∈ (role của cổng, 'all'). Poll 15 s.
export function useNotifications(limit = 50) {
  const { data, error, isLoading, mutate } = useDashboardSWR<StaffNotificationsResponse>(
    notificationsKey(limit),
    { refreshInterval: 15_000, revalidateOnFocus: true, keepPreviousData: true }
  );

  // Chuông header, trang Notification Center (limit khác) và badge sidebar dùng khoá khác nhau.
  function refreshRelated() {
    void revalidateDashboard(NOTIFICATIONS_PREFIX, "/stats/badges");
  }

  /** Trả về false nếu backend từ chối — trang có thể báo lỗi; chuông thì bỏ qua. */
  const markRead = async (id: number): Promise<boolean> => {
    try {
      await mutate(
        async (current) => {
          await markNotificationRead(id);
          if (!current) return current;
          const target = current.notifications.find((n) => n.id === id);
          return {
            notifications: current.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
            unread_count: target && !target.is_read ? Math.max(0, current.unread_count - 1) : current.unread_count,
          };
        },
        { revalidate: false }
      );
      return true;
    } catch {
      return false;
    } finally {
      refreshRelated();
    }
  };

  const markAllRead = async (): Promise<boolean> => {
    try {
      await mutate(
        async (current) => {
          await markAllNotificationsRead();
          if (!current) return current;
          return { notifications: current.notifications.map((n) => ({ ...n, is_read: true })), unread_count: 0 };
        },
        { revalidate: false }
      );
      return true;
    } catch {
      return false;
    } finally {
      refreshRelated();
    }
  };

  return {
    notifications: (data?.notifications ?? []) as StaffNotification[],
    unreadCount: data?.unread_count ?? 0,
    isLoading,
    error,
    markRead,
    markAllRead,
  };
}
