"use client";

import { FormEvent, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shh/ui";
import type { AssignableRole, CustomerDevice, PortalMember, UpdateMemberInput } from "@shh/api-client/portal";
import { ASSIGNABLE_ROLES, MEMBER_ROLE_LABELS, ROLE_HINTS } from "@shh/auth";
import GuestAccessFields from "./GuestAccessFields";
import { DEFAULT_GUEST_DAYS, guestExpiresAt } from "../../model/guest";

const fieldClass =
  "h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

type EditMemberDialogProps = {
  member: PortalMember;
  devices: CustomerDevice[];
  onClose: () => void;
  /** Lưu thay đổi; trả về thông điệp lỗi (đã dịch) hoặc null khi thành công. */
  onSave: (input: UpdateMemberInput) => Promise<string | null>;
};

// PATCH /members/:id — đổi vai trò, và với Khách thì sửa hạn + thiết bị được phép (chỉ OWNER).
// Mount kèm `key={member.id}` để mỗi lần mở dùng state mới.
export default function EditMemberDialog({ member, devices, onClose, onSave }: EditMemberDialogProps) {
  const initialRole: AssignableRole = member.role === "OWNER" ? "CONTROLLER" : member.role;
  const [role, setRole] = useState<AssignableRole>(initialRole);
  const [days, setDays] = useState<number | "keep">(initialRole === "GUEST" && member.expires_at ? "keep" : DEFAULT_GUEST_DAYS);
  const [deviceIds, setDeviceIds] = useState<number[]>(member.guest_device_ids ?? []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: UpdateMemberInput = {};
    if (role !== member.role) input.role = role;
    if (role === "GUEST") {
      if (deviceIds.length === 0) return setError("Hãy chọn ít nhất một thiết bị cho khách.");
      if (days !== "keep") input.expires_at = guestExpiresAt(days);
      input.device_ids = deviceIds;
    }
    if (Object.keys(input).length === 0) {
      onClose();
      return;
    }

    setError("");
    setSaving(true);
    const failure = await onSave(input);
    setSaving(false);
    if (failure) setError(failure);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Sửa quyền của {member.name}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600 dark:text-slate-300">Vai trò</span>
            <select value={role} onChange={(e) => setRole(e.target.value as AssignableRole)} className={fieldClass}>
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>)}
            </select>
            <span className="mt-1 block text-xs text-gray-400 dark:text-slate-500">{ROLE_HINTS[role]}</span>
          </label>

          {role === "GUEST" && (
            <GuestAccessFields
              idPrefix={`edit-${member.id}`}
              devices={devices}
              days={days}
              onDaysChange={setDays}
              selectedIds={deviceIds}
              onSelectedIdsChange={setDeviceIds}
              currentExpiry={member.role === "GUEST" ? member.expires_at : null}
            />
          )}

          {error && (
            <p role="alert" className="rounded border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button" onClick={onClose} disabled={saving}
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
      </DialogContent>
    </Dialog>
  );
}
