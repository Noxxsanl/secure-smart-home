"use client";

import useSWR from "swr";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/features/notifications/api/notifications.api";
import type { AppNotification } from "@/shared/types/api";

export function useNotifications() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Truyền null làm key SWR để tắt polling cho user không phải admin.
  // GET /api/notifications của backend chỉ dành cho admin (requireRole("admin")),
  // nên non-admin sẽ nhận 403 mỗi lần poll – vô hiệu hóa ngay tại hook thay vì để lỗi.
  const { data, mutate } = useSWR(
    isAdmin ? "/api/notifications" : null,
    fetchNotifications,
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );

  const markRead = async (id: number) => {
    await markNotificationRead(id);
    await mutate();
  };

  const markAllRead = async () => {
    await markAllNotificationsRead();
    await mutate();
  };

  return {
    notifications: (data?.notifications ?? []) as AppNotification[],
    unreadCount: data?.unread_count ?? 0,
    markRead,
    markAllRead,
    isAdmin,
  };
}
