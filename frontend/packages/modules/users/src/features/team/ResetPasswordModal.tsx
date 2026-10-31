"use client";

import { useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { ModalShell, InlineError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from "@shh/ui";
import { STAFF_PASSWORD_MIN } from "../../api/team.api";
import { errorMessage } from "@shh/api-client/dashboard";

const PASSWORD_MAX = 72;

type ResetPasswordModalProps = {
  username: string;
  onClose: () => void;
  onReset: (password: string) => Promise<unknown>;
};

// PATCH /team/:id { password } — Admin đặt lại mật khẩu cho Operator (FR-11.4).
// Mật khẩu không được lưu hay hiển thị lại ở bất kỳ đâu sau khi gửi.
export default function ResetPasswordModal({ username, onClose, onReset }: ResetPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (password.length < STAFF_PASSWORD_MIN) {
      setError(`Mật khẩu mới cần tối thiểu ${STAFF_PASSWORD_MIN} ký tự.`);
      return;
    }
    if (password !== confirm) {
      setError("Hai lần nhập mật khẩu chưa khớp. Nhập lại cho giống nhau.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onReset(password);
      onClose();
    } catch (err) {
      setError(errorMessage(err, {
        INVALID_INPUT: `Mật khẩu mới cần tối thiểu ${STAFF_PASSWORD_MIN} ký tự.`,
        FORBIDDEN: "Không đặt lại được mật khẩu của chính bạn hoặc của Admin khác tại đây.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Đặt lại mật khẩu"
      subtitle={username}
      icon={KeyRound}
      busy={submitting}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Đặt lại mật khẩu
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="reset-password" className={LABEL}>Mật khẩu mới</label>
        <input
          id="reset-password" type="password" value={password} maxLength={PASSWORD_MAX} autoComplete="new-password"
          onChange={(e) => { setPassword(e.target.value); setError(""); }}
          placeholder={`Ít nhất ${STAFF_PASSWORD_MIN} ký tự`} className={INPUT} disabled={submitting}
        />
      </div>
      <div>
        <label htmlFor="reset-confirm" className={LABEL}>Nhập lại mật khẩu mới</label>
        <input
          id="reset-confirm" type="password" value={confirm} maxLength={PASSWORD_MAX} autoComplete="new-password"
          onChange={(e) => { setConfirm(e.target.value); setError(""); }}
          className={INPUT} disabled={submitting}
        />
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-500">
        Gửi mật khẩu mới cho nhân viên qua kênh riêng. Hệ thống không hiển thị lại mật khẩu.
      </p>
      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
