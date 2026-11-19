import { BellOff, BellRing } from "lucide-react";
import type { BrowserNotificationState } from "../model/browserNotify";

type BrowserNotificationToggleProps = {
  state: BrowserNotificationState;
  /** Xin quyền — chỉ gọi khi người dùng bấm nút. */
  onEnable: () => void;
};

const NOTE_CLASS = "flex items-start gap-2 rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm";

// Nút bật popup thông báo của hệ điều hành + giải thích từng trạng thái (không hỗ trợ / thiếu HTTPS / đã chặn / đã bật).
export default function BrowserNotificationToggle({ state, onEnable }: BrowserNotificationToggleProps) {
  if (state === "unknown") return null;

  if (state === "granted") {
    return (
      <p role="status" className={`${NOTE_CLASS} text-gray-600 dark:text-slate-300`}>
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <span>Đã bật thông báo trên trình duyệt. Khi tab này đang ẩn, thông báo mới sẽ hiện thành popup của hệ điều hành.</span>
      </p>
    );
  }

  if (state === "default") {
    return (
      <div className={`${NOTE_CLASS} flex-wrap items-center justify-between gap-3`}>
        <p className="min-w-60 flex-1 text-gray-600 dark:text-slate-300">
          Nhận popup khi có thông báo mới (hẹn giờ đã chạy, cảnh báo thiết bị…) ngay cả lúc bạn đang xem tab khác.
        </p>
        <button
          type="button" onClick={onEnable}
          className="inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90"
        >
          <BellRing className="h-3.5 w-3.5" /> Bật thông báo trên trình duyệt
        </button>
      </div>
    );
  }

  const message =
    state === "denied"
      ? "Trình duyệt đang chặn thông báo của trang này. Hãy bấm biểu tượng ổ khoá cạnh thanh địa chỉ, đổi “Thông báo” thành “Cho phép” rồi tải lại trang."
      : state === "insecure"
        ? "Thông báo trên trình duyệt chỉ dùng được khi mở web qua HTTPS hoặc localhost. Hãy truy cập bằng địa chỉ https:// để bật."
        : "Trình duyệt này không hỗ trợ thông báo trên trình duyệt. Bạn vẫn nhận thông báo ở chuông và ở trang này.";

  return (
    <p role="status" className={`${NOTE_CLASS} text-gray-500 dark:text-slate-400`}>
      <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
