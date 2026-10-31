"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ModalShell from "./ModalShell";
import { InlineError } from "./PageStates";
import { errorMessage, type ErrorOverrides } from "@shh/api-client/dashboard";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY } from "../classes";

type ConfirmModalProps = {
  title: string;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  description: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /**
   * Gọi API. Resolve → hộp thoại tự đóng; ném lỗi (FetchError) → hộp thoại giữ
   * mở và hiện câu hướng dẫn tiếng Việt (qua `errorOverrides` nếu có ngữ cảnh riêng).
   */
  onConfirm: () => Promise<void>;
  onClose: () => void;
  errorOverrides?: ErrorOverrides;
};

// Hộp xác nhận cho thao tác gọi API: khoá nút trong lúc gửi (chống bấm đúp) và
// hiện lỗi ngay trong hộp thoại thay vì mất dấu. Render có điều kiện
// (`{target && <ConfirmModal …/>}`) để mỗi lần mở là trạng thái mới.
export default function ConfirmModal({
  title, subtitle, icon, description, confirmLabel, danger = false, onConfirm, onClose, errorOverrides,
}: ConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(errorMessage(err, errorOverrides));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      busy={submitting}
      onSubmit={handleConfirm}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="submit" disabled={submitting} className={danger ? BTN_DANGER : BTN_PRIMARY}>
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-gray-600 dark:text-slate-300">{description}</div>
      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
