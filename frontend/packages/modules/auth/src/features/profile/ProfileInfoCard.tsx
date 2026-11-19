"use client";

import { FormEvent, useState } from "react";
import { AtSign, Copy, Mail, MapPin, Pencil, Phone, User } from "lucide-react";
import { useToast } from "@shh/ui";
import { PHONE_PATTERN } from "../../model/errors";
import { updateProfile } from "../../api/profile.api";
import type { CustomerProfile } from "@shh/api-client/portal";
import { portalErrorMessage } from "@shh/api-client/portal";
import { formatDate } from "@shh/utils";

const fieldClass =
  "h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

const PROFILE_ERRORS: Record<string, string> = {
  INVALID_INPUT: "Thông tin chưa hợp lệ. Họ tên 2–128 ký tự; số điện thoại chỉ gồm chữ số, dấu cách, + . - (tối đa 20 ký tự); địa chỉ tối đa 255 ký tự.",
};

function validate(form: { full_name: string; phone: string; address: string }): string | null {
  const name = form.full_name.trim();
  if (name.length < 2 || name.length > 128) return "Họ tên cần từ 2 đến 128 ký tự.";
  const phone = form.phone.trim();
  if (phone && !PHONE_PATTERN.test(phone)) return "Số điện thoại chỉ gồm chữ số, dấu cách, + . - và tối đa 20 ký tự.";
  if (form.address.trim().length > 255) return "Địa chỉ tối đa 255 ký tự.";
  return null;
}

type ProfileInfoCardProps = {
  profile: CustomerProfile;
  /** Gọi sau khi lưu thành công — làm mới cache hồ sơ và tên hiển thị trên thanh bên. */
  onSaved: () => Promise<void>;
};

// Thông tin liên hệ của khách hàng: GET / PATCH /me/profile. Email và mã người dùng chỉ đọc.
export default function ProfileInfoCard({ profile, onSaved }: ProfileInfoCardProps) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", address: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function start() {
    setForm({ full_name: profile.full_name, phone: profile.phone ?? "", address: profile.address ?? "" });
    setError("");
    setEditing(true);
  }

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const invalid = validate(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateProfile({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      });
      await onSaved();
      setEditing(false);
      showToast("Đã lưu thông tin liên hệ.");
    } catch (err) {
      setError(portalErrorMessage(err, PROFILE_ERRORS));
    } finally {
      setSaving(false);
    }
  }

  async function copyTag() {
    try {
      await navigator.clipboard.writeText(profile.user_tag);
      showToast("Đã sao chép mã người dùng.");
    } catch {
      showToast("Không sao chép được. Hãy bôi đen mã rồi sao chép thủ công.", false);
    }
  }

  return (
    <section className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Thông tin liên hệ</h2>
        {!editing && (
          <button
            type="button" onClick={start}
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 dark:border-slate-600 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            <Pencil className="h-3.5 w-3.5" /> Chỉnh sửa
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600 dark:text-slate-300">Họ và tên</span>
            <input value={form.full_name} onChange={update("full_name")} maxLength={128} autoComplete="name" className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600 dark:text-slate-300">Số điện thoại</span>
            <input value={form.phone} onChange={update("phone")} maxLength={20} type="tel" autoComplete="tel" placeholder="Không bắt buộc" className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600 dark:text-slate-300">Địa chỉ</span>
            <input value={form.address} onChange={update("address")} maxLength={255} autoComplete="street-address" placeholder="Không bắt buộc" className={fieldClass} />
          </label>
          {error && (
            <p role="alert" className="rounded border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button" disabled={saving} onClick={() => setEditing(false)}
              className="rounded border border-gray-200 dark:border-slate-600 px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="submit" disabled={saving}
              className="rounded bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
            <User className="h-4 w-4 shrink-0 text-gray-400" />
            <dt className="sr-only">Họ và tên</dt>
            <dd className="min-w-0 truncate">{profile.full_name}</dd>
          </div>
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
            <Mail className="h-4 w-4 shrink-0 text-gray-400" />
            <dt className="sr-only">Email</dt>
            <dd className="min-w-0 truncate">{profile.email}</dd>
          </div>
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
            <Phone className="h-4 w-4 shrink-0 text-gray-400" />
            <dt className="sr-only">Điện thoại</dt>
            <dd className="min-w-0 truncate">{profile.phone ?? <span className="text-gray-400 dark:text-slate-500">Chưa cập nhật</span>}</dd>
          </div>
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
            <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
            <dt className="sr-only">Địa chỉ</dt>
            <dd className="min-w-0 truncate">{profile.address ?? <span className="text-gray-400 dark:text-slate-500">Chưa cập nhật</span>}</dd>
          </div>
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300 sm:col-span-2">
            <AtSign className="h-4 w-4 shrink-0 text-gray-400" />
            <dt className="sr-only">Mã người dùng</dt>
            <dd className="font-mono">{profile.user_tag}</dd>
            <button
              type="button" onClick={copyTag} aria-label="Sao chép mã người dùng" title="Sao chép mã người dùng"
              className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </dl>
      )}

      <p className="mt-3 text-xs text-gray-400 dark:text-slate-500">
        Tham gia từ {formatDate(profile.joined_at)}. Mã người dùng dùng khi cần bộ phận hỗ trợ gán nhà cho bạn. Không chia sẻ
        mật khẩu cho bất kỳ ai, kể cả nhân viên hỗ trợ.
      </p>
    </section>
  );
}
