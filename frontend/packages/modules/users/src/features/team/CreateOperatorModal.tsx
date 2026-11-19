"use client";

import { useState } from "react";
import { RefreshCw, Users as UsersIcon } from "lucide-react";
import { ModalShell, InlineError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from "@shh/ui";
import { STAFF_PASSWORD_MIN, STAFF_USERNAME_PATTERN } from "../../api/team.api";
import { errorMessage } from "@shh/api-client/dashboard";

// Bcrypt chỉ dùng 72 byte đầu của mật khẩu — chặn nhập dài hơn để không bị cắt âm thầm.
const PASSWORD_MAX = 72;

type CreateOperatorModalProps = {
  onClose: () => void;
  onCreate: (input: { username: string; password: string }) => Promise<unknown>;
};

// POST /team — Admin tạo tài khoản Operator (FR-11.4). Admin khác do hệ thống cấp, không tạo ở đây.
// Render có điều kiện để mỗi lần mở là form mới.
export default function CreateOperatorModal({ onClose, onCreate }: CreateOperatorModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!STAFF_USERNAME_PATTERN.test(username)) {
      setError("Tên đăng nhập gồm 3–32 ký tự: chữ thường không dấu, số và các dấu . _ - (VD: operator04).");
      return;
    }
    if (password.length < STAFF_PASSWORD_MIN) {
      setError(`Mật khẩu cần tối thiểu ${STAFF_PASSWORD_MIN} ký tự.`);
      return;
    }
    if (password !== confirm) {
      setError("Hai lần nhập mật khẩu chưa khớp. Nhập lại cho giống nhau.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onCreate({ username, password });
      onClose();
    } catch (err) {
      setError(errorMessage(err, {
        INVALID_INPUT: `Tên đăng nhập 3–32 ký tự (chữ thường, số, . _ -) và mật khẩu tối thiểu ${STAFF_PASSWORD_MIN} ký tự.`,
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Thêm Operator"
      subtitle="Tạo tài khoản nhân viên vận hành mới"
      icon={UsersIcon}
      busy={submitting}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Tạo tài khoản
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="team-username" className={LABEL}>Tên đăng nhập</label>
        <input
          id="team-username" type="text" value={username} maxLength={32} autoComplete="off" autoCapitalize="none"
          onChange={(e) => { setUsername(e.target.value.toLowerCase()); setError(""); }}
          placeholder="VD: operator04" className={INPUT} disabled={submitting}
        />
      </div>
      <div>
        <label htmlFor="team-password" className={LABEL}>Mật khẩu</label>
        <input
          id="team-password" type="password" value={password} maxLength={PASSWORD_MAX} autoComplete="new-password"
          onChange={(e) => { setPassword(e.target.value); setError(""); }}
          placeholder={`Ít nhất ${STAFF_PASSWORD_MIN} ký tự`} className={INPUT} disabled={submitting}
        />
      </div>
      <div>
        <label htmlFor="team-confirm" className={LABEL}>Nhập lại mật khẩu</label>
        <input
          id="team-confirm" type="password" value={confirm} maxLength={PASSWORD_MAX} autoComplete="new-password"
          onChange={(e) => { setConfirm(e.target.value); setError(""); }}
          className={INPUT} disabled={submitting}
        />
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-500">
        Tài khoản mới có vai trò <span className="font-semibold">Operator</span>. Hãy gửi mật khẩu cho nhân viên qua kênh riêng
        và nhờ họ đổi sớm — hệ thống không hiển thị lại mật khẩu.
      </p>
      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
