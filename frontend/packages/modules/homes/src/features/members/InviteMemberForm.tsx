"use client";

import { FormEvent, useState } from "react";
import { UserPlus } from "lucide-react";
import { EMAIL_PATTERN, ASSIGNABLE_ROLES, MEMBER_ROLE_LABELS, ROLE_HINTS } from "@shh/auth";
import type { AssignableRole, CustomerDevice, InviteMemberInput } from "@shh/api-client/portal";
import GuestAccessFields from "./GuestAccessFields";
import { DEFAULT_GUEST_DAYS, guestExpiresAt } from "../../model/guest";

const fieldClass =
  "h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

type InviteMemberFormProps = {
  /** Thiết bị của nhà (không gồm gateway) — dùng khi mời Khách. */
  devices: CustomerDevice[];
  /** Gửi lời mời; trả về thông điệp lỗi (đã dịch) hoặc null khi thành công. */
  onInvite: (input: InviteMemberInput) => Promise<string | null>;
};

// POST /homes/:id/members/invite — chỉ OWNER. Khách (GUEST) bắt buộc có hạn ≤ 30 ngày + thiết bị được phép.
export default function InviteMemberForm({ devices, onInvite }: InviteMemberFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("CONTROLLER");
  const [days, setDays] = useState(DEFAULT_GUEST_DAYS);
  const [deviceIds, setDeviceIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || cleanName.length > 128) return setError("Vui lòng nhập tên hiển thị của người được mời (tối đa 128 ký tự).");
    if (!cleanEmail || cleanEmail.length > 190 || !EMAIL_PATTERN.test(cleanEmail)) {
      return setError("Email chưa đúng định dạng (VD: ten@example.com).");
    }
    if (role === "GUEST" && deviceIds.length === 0) return setError("Hãy chọn ít nhất một thiết bị cho khách.");

    const input: InviteMemberInput = { email: cleanEmail, name: cleanName, role };
    if (role === "GUEST") {
      input.expires_at = guestExpiresAt(days);
      input.device_ids = deviceIds;
    }

    setError("");
    setSubmitting(true);
    const failure = await onInvite(input);
    setSubmitting(false);
    if (failure) {
      setError(failure);
      return;
    }
    setName("");
    setEmail("");
    setRole("CONTROLLER");
    setDays(DEFAULT_GUEST_DAYS);
    setDeviceIds([]);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Mời thành viên</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên hiển thị" maxLength={128} className={fieldClass} aria-label="Tên hiển thị" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email người được mời" maxLength={190} className={fieldClass} aria-label="Email người được mời" />
        <select value={role} onChange={(e) => setRole(e.target.value as AssignableRole)} className={fieldClass} aria-label="Vai trò">
          {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>)}
        </select>
        <button type="submit" disabled={submitting} className="h-9 rounded bg-brand px-4 text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50">
          {submitting ? "Đang gửi…" : "Gửi lời mời"}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">{ROLE_HINTS[role]} Lời mời hết hạn sau 7 ngày.</p>

      {role === "GUEST" && (
        <div className="mt-3">
          <GuestAccessFields
            idPrefix="invite"
            devices={devices}
            days={days}
            onDaysChange={(d) => setDays(d === "keep" ? DEFAULT_GUEST_DAYS : d)}
            selectedIds={deviceIds}
            onSelectedIdsChange={setDeviceIds}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
      )}
    </form>
  );
}
