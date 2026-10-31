"use client";

import { useToast } from "@shh/ui";
import { useRevalidate, overviewKey, portalErrorMessage } from "@shh/api-client/portal";
import { markAllNotificationsRead, markNotificationRead, useNotificationList } from "./portalNotifications.api";
import type { NotificationList } from "@shh/api-client/portal";
import { useCurrentHome } from "@shh/auth";

// Đánh dấu "đã đọc" ngay trên cache (optimistic) để chuông và huy hiệu đổi tức thì,
// rồi mới đợi API; API lỗi thì SWR hoàn tác về dữ liệu cũ.
function withRead(list: NotificationList | undefined, ids: number[] | "all"): NotificationList {
  if (!list) return { notifications: [], unread_count: 0 };
  let newlyRead = 0;
  const notifications = list.notifications.map((n) => {
    if (n.is_read || (ids !== "all" && !ids.includes(n.id))) return n;
    newlyRead += 1;
    return { ...n, is_read: true };
  });
  return { notifications, unread_count: Math.max(0, list.unread_count - newlyRead) };
}

/**
 * Thông báo của nhà đang chọn (GET /notifications?home_id=, polling 15 s) kèm
 * thao tác đánh dấu đã đọc (PATCH /notifications/:id/read, /read-all).
 * Chưa có nhà nào thì lấy tất cả thông báo của tài khoản.
 */
export function useHomeNotifications() {
  const { current } = useCurrentHome();
  const homeId = current?.home.id ?? null;
  const { data, error, isLoading, mutate } = useNotificationList(homeId);
  const { showToast } = useToast();
  const revalidate = useRevalidate();

  async function markAs(call: () => Promise<void>, ids: number[] | "all") {
    try {
      await mutate(
        async (list) => {
          await call();
          return withRead(list, ids);
        },
        { optimisticData: (list) => withRead(list, ids), rollbackOnError: true, revalidate: true },
      );
      // "Cảnh báo chưa xử lý" và số thông báo chưa đọc của Tổng quan lấy từ overview.
      if (homeId !== null) void revalidate(overviewKey(homeId));
    } catch (err) {
      showToast(portalErrorMessage(err), false);
    }
  }

  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unread_count ?? 0,
    isLoading,
    error: data ? null : error,
    markRead: (id: number) => markAs(() => markNotificationRead(id), [id]),
    markAllRead: () => markAs(() => markAllNotificationsRead(homeId), "all"),
    refresh: () => mutate(),
  };
}
