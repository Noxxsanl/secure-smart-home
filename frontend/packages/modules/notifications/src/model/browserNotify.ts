// Thông báo đẩy mức (a): popup của hệ điều hành qua Notification API, chỉ khi tab đang ẩn và người dùng đã cấp quyền.
// Không có Service Worker / Web Push nên đóng hẳn trình duyệt thì không có popup — chuông trong app vẫn là nguồn chính.

export type BrowserNotificationState =
  /** Render phía server — chưa biết trình duyệt. */
  | "unknown"
  /** Trình duyệt không có Notification API. */
  | "unsupported"
  /** Trang không chạy trên HTTPS hoặc localhost nên trình duyệt từ chối xin quyền. */
  | "insecure"
  | "denied"
  | "default"
  | "granted";

export function readBrowserNotificationState(): BrowserNotificationState {
  if (typeof window === "undefined") return "unknown";
  if (!window.isSecureContext) return "insecure";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// Id đã xử lý trong tab này — chuông (PortalShell) và trang Thông báo cùng gọi useHomeNotifications nên mỗi nơi
// tự phát hiện thông báo mới; tập dùng chung này giữ cho mỗi thông báo chỉ báo một lần.
const announced = new Set<number>();

/** true lần đầu thấy id này trong tab, false nếu đã báo rồi. */
export function markAnnounced(id: number): boolean {
  if (announced.has(id)) return false;
  announced.add(id);
  return true;
}

/** Popup hệ điều hành; trả về true nếu đã hiện. Lỗi (VD Chrome Android không cho `new Notification`) được bỏ qua. */
export function showBrowserNotification(id: number, title: string, body: string): boolean {
  if (readBrowserNotificationState() !== "granted") return false;
  try {
    // `tag` trùng thì trình duyệt thay thông báo cũ thay vì chồng thêm.
    const popup = new Notification(title, { body, tag: `shh-${id}` });
    popup.onclick = () => {
      window.focus();
      popup.close();
    };
    return true;
  } catch {
    return false;
  }
}
