"use client";

import { useState } from "react";
import { Pencil, RefreshCw } from "lucide-react";
import { ModalShell, InlineError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from "@shh/ui";
import { updateSmartHome } from "../../api/smartHomes.api";
import { errorMessage } from "@shh/api-client/dashboard";
import type { SmartHomeDetailHome, UpdateSmartHomeInput } from "@shh/api-client/dashboard";

type RenameHomeDialogProps = {
  home: SmartHomeDetailHome;
  onClose: () => void;
  onSaved: () => void;
};

// PATCH /smart-homes/:id { name?, address? } — Admin, hoặc Operator khi nhà chưa kích hoạt.
export default function RenameHomeDialog({ home, onClose, onSaved }: RenameHomeDialogProps) {
  const [name, setName] = useState(home.name);
  const [address, setAddress] = useState(home.address ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    if (trimmedName.length < 2 || trimmedName.length > 128) { setError("Tên nhà cần từ 2 đến 128 ký tự."); return; }
    if (trimmedAddress.length > 255) { setError("Địa chỉ tối đa 255 ký tự."); return; }

    const patch: UpdateSmartHomeInput = {};
    if (trimmedName !== home.name) patch.name = trimmedName;
    if (trimmedAddress !== (home.address ?? "")) patch.address = trimmedAddress || null;
    if (Object.keys(patch).length === 0) { onClose(); return; }

    setSubmitting(true);
    setError("");
    try {
      await updateSmartHome(home.id, patch);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, {
        FORBIDDEN: "Nhà đã được khách hàng kích hoạt — chỉ Admin (hoặc chính khách hàng trên ứng dụng) mới đổi được tên/địa chỉ.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Đổi tên / địa chỉ"
      subtitle={home.name}
      icon={Pencil}
      busy={submitting}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Lưu
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="rename-home-name" className={LABEL}>Tên Smart Home</label>
        <input id="rename-home-name" type="text" value={name} maxLength={128} onChange={(e) => setName(e.target.value)} className={INPUT} disabled={submitting} />
      </div>
      <div>
        <label htmlFor="rename-home-address" className={LABEL}>Địa chỉ</label>
        <input id="rename-home-address" type="text" value={address} maxLength={255} onChange={(e) => setAddress(e.target.value)} className={INPUT} disabled={submitting} />
      </div>
      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
