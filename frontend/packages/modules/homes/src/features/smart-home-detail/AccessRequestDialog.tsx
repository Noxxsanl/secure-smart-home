"use client";

import { useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { ModalShell, InlineError, BTN_PRIMARY, BTN_SECONDARY, LABEL, SELECT, TEXTAREA } from "@shh/ui";
import { requestHomeAccess } from "../../api/smartHomes.api";
import { errorMessage } from "@shh/api-client/dashboard";
import type { OperatorAccessGrant } from "@shh/api-client/dashboard";

const DURATIONS = [1, 2, 4, 8, 12, 24];
const REASON_MIN = 5;
const REASON_MAX = 255;

type AccessRequestDialogProps = {
  homeId: number;
  homeName: string;
  onClose: () => void;
  onGranted: (grant: OperatorAccessGrant) => void;
};

// FR-9.6 — Operator tự xin quyền có thời hạn (break-glass): hiệu lực ngay, Admin
// được thông báo, mọi lần xem đều ghi log. Render có điều kiện để mỗi lần mở là form mới.
export default function AccessRequestDialog({ homeId, homeName, onClose, onGranted }: AccessRequestDialogProps) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const trimmed = reason.trim();
  const valid = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;

  async function handleSubmit() {
    if (!valid) {
      setError(`Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự (VD: số ticket, mô tả sự cố).`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const grant = await requestHomeAccess(homeId, { reason: trimmed, duration_hours: duration });
      onGranted(grant);
      onClose();
    } catch (err) {
      setError(errorMessage(err, {
        FORBIDDEN: "Chỉ tài khoản Operator mới gửi được yêu cầu này. Admin luôn xem được toàn bộ dữ liệu.",
        INVALID_INPUT: `Lý do cần ${REASON_MIN}–${REASON_MAX} ký tự và thời hạn từ 1 đến 24 giờ.`,
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Yêu cầu quyền truy cập"
      subtitle={homeName}
      icon={KeyRound}
      busy={submitting}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="submit" disabled={submitting || !valid} className={BTN_PRIMARY}>
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Gửi yêu cầu
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-slate-300">
        Quyền có hiệu lực ngay sau khi gửi và tự hết hạn. Admin sẽ nhận thông báo; mọi lần bạn xem dữ liệu của nhà này đều
        được ghi vào User Activity Log.
      </p>
      <div>
        <label htmlFor="access-reason" className={LABEL}>Lý do <span className="text-critical">*</span></label>
        <textarea
          id="access-reason"
          rows={3}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="VD: Ticket #1024 — gateway mất kết nối, cần kiểm tra RSSI"
          className={TEXTAREA}
          disabled={submitting}
        />
        <p className={`mt-1 text-right text-[11px] ${trimmed.length > 0 && trimmed.length < REASON_MIN ? "text-warning" : "text-gray-400 dark:text-slate-500"}`}>
          {trimmed.length}/{REASON_MAX} (tối thiểu {REASON_MIN})
        </p>
      </div>
      <div>
        <label htmlFor="access-duration" className={LABEL}>Thời hạn</label>
        <select
          id="access-duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className={`${SELECT} w-full`}
          disabled={submitting}
        >
          {DURATIONS.map((h) => <option key={h} value={h}>{h} giờ</option>)}
        </select>
      </div>
      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
