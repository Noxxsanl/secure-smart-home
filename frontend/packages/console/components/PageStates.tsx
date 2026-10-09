"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Lock, RefreshCw, SearchX } from "lucide-react";
import { errorMessage, isAccessGrantRequired, isNotFound, type ErrorOverrides } from "@smarthome/console/lib/errors";
import { BTN_SECONDARY } from "@smarthome/console/lib/ui";

export function PageLoading({ label = "Đang tải…" }: { label?: string }) {
  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
        <RefreshCw className="h-4 w-4 animate-spin" /> {label}
      </div>
    </div>
  );
}

type PageErrorProps = {
  error: unknown;
  backHref: string;
  backLabel: string;
  /** Câu hiển thị khi 404 (VD "Không tìm thấy Smart Home này."). */
  notFoundText: string;
  onRetry?: () => void;
  overrides?: ErrorOverrides;
};

// Trạng thái lỗi toàn trang cho trang chi tiết: 404 / cần quyền truy cập / lỗi khác.
export function PageError({ error, backHref, backLabel, notFoundText, onRetry, overrides }: PageErrorProps) {
  const notFound = isNotFound(error);
  const needsGrant = isAccessGrantRequired(error);
  const Icon = notFound ? SearchX : needsGrant ? Lock : AlertTriangle;
  const message = notFound
    ? `${notFoundText} Có thể dữ liệu đã bị xoá hoặc đường dẫn không đúng.`
    : errorMessage(error, overrides);

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${notFound ? "bg-gray-100 dark:bg-slate-700" : "bg-critical-soft"}`}>
        <Icon className={`h-5 w-5 ${notFound ? "text-gray-400 dark:text-slate-500" : "text-critical"}`} />
      </div>
      <p className="max-w-md text-sm text-gray-600 dark:text-slate-300">{message}</p>
      <div className="flex gap-2">
        {onRetry && !notFound && (
          <button type="button" onClick={onRetry} className={BTN_SECONDARY}>
            <RefreshCw className="h-3.5 w-3.5" /> Thử lại
          </button>
        )}
        <Link href={backHref} className={BTN_SECONDARY}>
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </Link>
      </div>
    </div>
  );
}

/** Hộp lỗi nhỏ trong form/dialog/thẻ. */
export function InlineError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded border border-critical/20 bg-critical-soft px-3 py-2 text-sm text-critical">
      {children}
    </p>
  );
}

/** Thanh báo lỗi tải dữ liệu của một danh sách (vẫn giữ dữ liệu cũ nếu có). */
export function LoadErrorBar({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-critical/20 bg-critical-soft px-4 py-2 text-sm text-critical">
      <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{errorMessage(error)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-xs font-semibold underline-offset-2 hover:underline">
          Thử lại
        </button>
      )}
    </div>
  );
}
