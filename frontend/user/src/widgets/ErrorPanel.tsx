import { AlertTriangle, WifiOff } from "lucide-react";
import { errorStatus } from "@/lib/api/client";
import { portalErrorMessage } from "@/lib/errors";

type ErrorPanelProps = {
  error: unknown;
  /** Có thì hiện nút "Thử lại". */
  onRetry?: () => void;
  /** Thông điệp riêng theo mã lỗi, VD { FORBIDDEN: "…" } — xem portalErrorMessage. */
  overrides?: Record<string, string>;
};

// Khối lỗi dùng chung cho mọi trang: câu hướng dẫn tiếng Việt (không mã thô) + nút thử lại.
export default function ErrorPanel({ error, onRetry, overrides }: ErrorPanelProps) {
  const Icon = errorStatus(error) === 0 ? WifiOff : AlertTriangle;
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-md border border-[#E5EAF0] bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800"
    >
      <Icon className="h-8 w-8 text-gray-300 dark:text-slate-600" />
      <p className="mt-3 max-w-md text-sm text-gray-600 dark:text-slate-300">{portalErrorMessage(error, overrides)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-90"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}
