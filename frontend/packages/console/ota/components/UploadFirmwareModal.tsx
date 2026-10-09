"use client";

import { useState } from "react";
import { UploadCloud, FileArchive, RefreshCw } from "lucide-react";
import ModalShell from "@smarthome/console/components/ModalShell";
import { InlineError } from "@smarthome/console/components/PageStates";
import { FIRMWARE_MAX_BYTES, FIRMWARE_VERSION_PATTERN, uploadFirmware } from "@smarthome/console/api/ota.api";
import { errorMessage } from "@smarthome/console/lib/errors";
import { formatBytes } from "@smarthome/console/lib/format";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, TEXTAREA } from "@smarthome/console/lib/ui";
import type { FirmwareType, FirmwareVersion } from "@smarthome/console/api/types";

const RELEASE_NOTES_MAX = 500;

type UploadFirmwareModalProps = {
  defaultType: FirmwareType;
  onClose: () => void;
  onUploaded: (firmware: FirmwareVersion) => void;
};

// FR-9.3 — Admin tải file .bin lên: gửi nguyên văn (octet-stream) kèm metadata trên query;
// server tự tính SHA-256 nên không cần (và không nên) tính ở client. File chỉ được LƯU,
// chưa triển khai tới thiết bị nào — Deploy là bước riêng. Render có điều kiện để mỗi lần mở là form mới.
export default function UploadFirmwareModal({ defaultType, onClose, onUploaded }: UploadFirmwareModalProps) {
  const [type, setType] = useState<FirmwareType>(defaultType);
  const [version, setVersion] = useState("");
  const [stable, setStable] = useState(false);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const trimmedVersion = version.trim();
    if (!FIRMWARE_VERSION_PATTERN.test(trimmedVersion)) {
      setError("Số phiên bản cần dạng 2.4.1 hoặc 2.4.1-beta.1 (ba số cách nhau bởi dấu chấm).");
      return;
    }
    if (!file) { setError("Chọn file firmware (.bin) cần tải lên."); return; }
    if (!file.name.toLowerCase().endsWith(".bin")) { setError("Chỉ nhận file firmware có đuôi .bin."); return; }
    if (file.size === 0) { setError("File đang chọn rỗng. Kiểm tra lại file firmware."); return; }
    if (file.size > FIRMWARE_MAX_BYTES) {
      setError(`File lớn hơn ${formatBytes(FIRMWARE_MAX_BYTES)} — kiểm tra lại file firmware (đã chọn ${formatBytes(file.size)}).`);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const created = await uploadFirmware({
        type, version: trimmedVersion, stable, file, release_notes: notes.trim() || undefined,
      });
      onUploaded(created);
      onClose();
    } catch (err) {
      setError(errorMessage(err, {
        // 413 từ proxy/Express có thể không kèm mã lỗi JSON — ưu tiên theo status.
        "413": `File quá lớn (tối đa ${formatBytes(FIRMWARE_MAX_BYTES)}). Kiểm tra lại file firmware .bin.`,
        INVALID_INPUT: "Thông tin firmware chưa hợp lệ: kiểm tra số phiên bản (VD 2.4.1) và file .bin rồi thử lại.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Upload Firmware"
      subtitle="File .bin được lưu vào kho firmware — chưa triển khai tới thiết bị nào"
      icon={UploadCloud}
      busy={submitting}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
            {submitting ? "Đang tải lên…" : "Tải lên"}
          </button>
        </>
      }
    >
      <div>
        <span className={LABEL}>Loại</span>
        <div className="grid grid-cols-2 gap-2">
          {(["gateway", "node"] as FirmwareType[]).map((t) => (
            <button
              key={t}
              type="button"
              disabled={submitting}
              onClick={() => setType(t)}
              className={`rounded border-2 px-3 py-2 text-sm font-medium transition disabled:opacity-60
                ${type === t ? "border-brand bg-brand-soft text-brand" : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-500"}`}
            >
              {t === "gateway" ? "Gateway" : "Node"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="fw-version" className={LABEL}>Phiên bản</label>
        <input
          id="fw-version" type="text" value={version} onChange={(e) => setVersion(e.target.value)}
          placeholder="VD: 2.4.1 hoặc 2.5.0-beta.1" className={INPUT} disabled={submitting} autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="fw-file" className={LABEL}>File firmware (.bin, tối đa {formatBytes(FIRMWARE_MAX_BYTES)})</label>
        <input
          id="fw-file" type="file" accept=".bin"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }}
          disabled={submitting}
          className="block w-full text-sm text-gray-600 dark:text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand hover:file:brightness-95"
        />
        {file && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
            <FileArchive size={12} /> {file.name} · {formatBytes(file.size)}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="fw-notes" className={LABEL}>Ghi chú phát hành (tuỳ chọn)</label>
        <textarea
          id="fw-notes" rows={3} maxLength={RELEASE_NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="VD: Sửa lỗi mất kết nối MQTT sau 24 giờ" className={TEXTAREA} disabled={submitting}
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-slate-400">
        <input
          type="checkbox" checked={stable} onChange={(e) => setStable(e.target.checked)} disabled={submitting}
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded accent-brand"
        />
        <span>
          Đánh dấu là bản ổn định (Stable)
          <span className="block text-xs text-gray-400 dark:text-slate-500">Chỉ nên đánh dấu sau khi đã thử trên một nhà. Có thể đổi sau ở danh sách.</span>
        </span>
      </label>

      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
