"use client";

import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog } from "@smarthome/shared/ui/Dialog";

type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  /** Đang gửi request — chặn đóng bằng Esc/nền/nút X để không mất kết quả. */
  busy?: boolean;
  /** Có thì phần thân + chân được bọc trong <form> (Enter để gửi). */
  onSubmit?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

// Khung dialog chung của console, dựa trên Dialog (portal + Esc + khoá cuộn) của shared/ui.
export default function ModalShell({
  open, onClose, title, subtitle, icon: Icon, busy = false, onSubmit, footer, children,
}: ModalShellProps) {
  function requestClose() {
    if (!busy) onClose();
  }

  const body = (
    <>
      <div className="space-y-3 px-5 py-4">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-slate-700 px-5 py-3">
          {footer}
        </div>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-brand-soft">
              <Icon className="h-3.5 w-3.5 text-brand" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</p>
            {subtitle && <p className="truncate text-xs text-gray-400 dark:text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={requestClose}
          disabled={busy}
          aria-label="Đóng"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40"
        >
          <X size={14} />
        </button>
      </div>
      {onSubmit ? (
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (!busy) onSubmit(); }}>
          {body}
        </form>
      ) : body}
    </Dialog>
  );
}
