"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { useToast } from "@shh/ui";
import { apiErrorCode } from "@shh/api-client";
import { useAuth } from "../../api/useAuth";
import { changePassword } from "../../api/profile.api";
import { portalErrorMessage } from "@shh/api-client/portal";

const fieldClass =
  "h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

const PASSWORD_ERRORS: Record<string, string> = {
  INVALID_INPUT: "Mật khẩu mới chưa hợp lệ. Mật khẩu cần từ 8 đến 128 ký tự.",
  INVALID_CREDENTIALS: "Mật khẩu hiện tại không đúng. Vui lòng nhập lại.",
};

// Mã lỗi 401 của PHIÊN (khác INVALID_CREDENTIALS = sai mật khẩu hiện tại).
const SESSION_ERRORS = new Set(["NO_TOKEN", "INVALID_TOKEN", "TOKEN_EXPIRED"]);

// POST /me/password. changePassword() tắt chuyển hướng 401 mặc định vì 401
// INVALID_CREDENTIALS chỉ là "sai mật khẩu hiện tại" — ở đây tự phân biệt với hết phiên.
export default function ChangePasswordCard() {
  const { expireSession } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.current) return setError("Vui lòng nhập mật khẩu hiện tại.");
    if (form.next.length < 8 || form.next.length > 128) return setError("Mật khẩu mới cần từ 8 đến 128 ký tự.");
    if (form.next === form.current) return setError("Mật khẩu mới cần khác mật khẩu hiện tại.");
    if (form.next !== form.confirm) return setError("Mật khẩu nhập lại chưa khớp.");

    setSaving(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      showToast("Đã đổi mật khẩu. Ứng dụng di động sẽ yêu cầu đăng nhập lại.");
    } catch (err) {
      const code = apiErrorCode(err);
      if (code && SESSION_ERRORS.has(code)) {
        expireSession();
        return;
      }
      setError(portalErrorMessage(err, PASSWORD_ERRORS));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Đổi mật khẩu</h2>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-3" noValidate>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-600 dark:text-slate-300">Mật khẩu hiện tại</span>
          <input type="password" value={form.current} onChange={update("current")} autoComplete="current-password" maxLength={128} className={fieldClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-600 dark:text-slate-300">Mật khẩu mới</span>
          <input type="password" value={form.next} onChange={update("next")} autoComplete="new-password" maxLength={128} placeholder="Tối thiểu 8 ký tự" className={fieldClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-600 dark:text-slate-300">Nhập lại mật khẩu mới</span>
          <input type="password" value={form.confirm} onChange={update("confirm")} autoComplete="new-password" maxLength={128} className={fieldClass} />
        </label>

        {error && (
          <p role="alert" className="rounded border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical sm:col-span-3">{error}</p>
        )}

        <div className="flex items-center justify-between gap-3 sm:col-span-3">
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Sau khi đổi mật khẩu, ứng dụng di động sẽ yêu cầu bạn đăng nhập lại.
          </p>
          <button
            type="submit" disabled={saving}
            className="shrink-0 rounded bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50"
          >
            {saving ? "Đang đổi…" : "Đổi mật khẩu"}
          </button>
        </div>
      </form>
    </section>
  );
}
