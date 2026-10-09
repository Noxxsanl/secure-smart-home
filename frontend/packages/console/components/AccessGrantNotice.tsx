import { Lock } from "lucide-react";

type AccessGrantNoticeProps = {
  children: React.ReactNode;
  /** Nút/liên kết để Operator đi xin quyền (VD mở AccessRequestDialog). */
  action?: React.ReactNode;
};

// FR-9.6 — dữ liệu khách hàng của nhà đã kích hoạt bị ẩn với Operator cho tới
// khi có quyền truy cập có thời hạn. Hộp nhắc dùng ở trang nhà, thiết bị, gateway.
export default function AccessGrantNotice({ children, action }: AccessGrantNoticeProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-soft px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5 text-sm text-warning">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}
