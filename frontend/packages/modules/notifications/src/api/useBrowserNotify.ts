"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useToast } from "@shh/ui";
import type { CustomerNotification } from "@shh/api-client/portal";
import {
  markAnnounced, readBrowserNotificationState, showBrowserNotification, type BrowserNotificationState,
} from "../model/browserNotify";

// ---- Trạng thái quyền ------------------------------------------------------

const listeners = new Set<() => void>();
const notifyListeners = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Người dùng đổi quyền trong cài đặt trang (ổ khoá cạnh thanh địa chỉ) → cập nhật nút ngay, không cần tải lại.
  let status: PermissionStatus | null = null;
  let cancelled = false;
  if (typeof navigator !== "undefined" && navigator.permissions) {
    navigator.permissions
      .query({ name: "notifications" })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.onchange = onChange;
      })
      .catch(() => undefined);
  }
  return () => {
    listeners.delete(onChange);
    cancelled = true;
    if (status) status.onchange = null;
  };
}

/**
 * Trạng thái quyền thông báo của trình duyệt + hàm xin quyền. Chỉ xin khi người dùng bấm nút (gọi `request`),
 * không bao giờ tự xin lúc tải trang.
 */
export function useBrowserNotificationPermission() {
  const state = useSyncExternalStore<BrowserNotificationState>(subscribe, readBrowserNotificationState, () => "unknown");

  async function request(): Promise<BrowserNotificationState> {
    if (readBrowserNotificationState() === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        // Trình duyệt từ chối xin quyền — trạng thái đọc lại bên dưới sẽ phản ánh.
      }
      notifyListeners();
    }
    return readBrowserNotificationState();
  }

  return { state, request };
}

// ---- Phát hiện thông báo mới ----------------------------------------------

/**
 * Với danh sách thông báo đang được poll: lần tải đầu của mỗi nhà chỉ ghi nhớ id (không popup), thông báo chưa đọc
 * xuất hiện sau đó → tab ẩn: popup hệ điều hành (nếu đã cấp quyền); tab đang xem: toast (chuông đã tự cập nhật).
 */
export function useAnnounceNewNotifications(homeId: number | null, list: CustomerNotification[] | undefined) {
  const { showToast } = useToast();
  const baseline = useRef<{ homeId: number | null; seen: Set<number> } | null>(null);

  useEffect(() => {
    if (!list) return;
    // Đổi nhà → danh sách khác hẳn; coi lần tải kế tiếp là lần đầu để không báo dồn cả danh sách của nhà mới.
    if (!baseline.current || baseline.current.homeId !== homeId) {
      baseline.current = { homeId, seen: new Set(list.map((n) => n.id)) };
      list.forEach((n) => markAnnounced(n.id));
      return;
    }
    const { seen } = baseline.current;
    for (const n of list) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      if (n.is_read || !markAnnounced(n.id)) continue;
      if (document.visibilityState === "hidden") {
        showBrowserNotification(n.id, n.title, n.message);
      } else {
        showToast(`${n.title}: ${n.message}`, n.severity === "info" || n.severity === "success");
      }
    }
  }, [homeId, list, showToast]);
}
