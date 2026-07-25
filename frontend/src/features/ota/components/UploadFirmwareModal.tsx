"use client";

import { useRef, useState } from "react";
import { UploadCloud, X, FileArchive } from "lucide-react";
import type { FirmwareType } from "@/shared/mock/types";

type UploadFirmwareModalProps = {
  open: boolean;
  defaultType: FirmwareType;
  onClose: () => void;
  onUpload: (input: { type: FirmwareType; version: string; stable: boolean; fileName: string; sizeKb: number }) => void;
};

export default function UploadFirmwareModal({ open, defaultType, onClose, onUpload }: UploadFirmwareModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<FirmwareType>(defaultType);
  const [version, setVersion] = useState("");
  const [stable, setStable] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  if (!open) return null;

  function reset() {
    setType(defaultType); setVersion(""); setStable(true); setFile(null); setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!version.trim()) { setError("Vui lòng nhập số phiên bản."); return; }
    if (!file) { setError("Vui lòng chọn file firmware (.bin)."); return; }
    onUpload({
      type,
      version: version.trim(),
      stable,
      fileName: file.name,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
    });
    reset();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-brand-soft">
              <UploadCloud className="h-3.5 w-3.5 text-brand" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Upload Firmware</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">File .bin sẽ được lưu vào firmware store, chưa deploy ngay</p>
            </div>
          </div>
          <button type="button" onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-3 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Loại</label>
              <div className="grid grid-cols-2 gap-2">
                {(["gateway", "node"] as FirmwareType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`rounded border-2 px-3 py-2 text-sm font-medium capitalize transition
                      ${type === t ? "border-brand bg-brand-soft text-brand" : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-500"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Phiên bản</label>
              <input type="text" value={version} onChange={(e) => setVersion(e.target.value)}
                placeholder="VD: 2.4.1"
                className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">File firmware (.bin)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".bin"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 dark:text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand hover:file:brightness-95"
              />
              {file && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                  <FileArchive size={12} /> {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
              <input type="checkbox" checked={stable} onChange={(e) => setStable(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer rounded accent-brand" />
              Đánh dấu là bản ổn định (Stable)
            </label>

            {error && (
              <p className="rounded border border-critical/20 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-slate-700 px-5 py-3">
            <button type="button" onClick={handleClose}
              className="h-9 rounded border border-gray-200 dark:border-slate-600 px-4 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition">
              Huỷ
            </button>
            <button type="submit"
              className="flex h-9 items-center gap-1.5 rounded bg-brand px-4 text-sm font-semibold text-white hover:brightness-90 transition">
              <UploadCloud size={14} /> Tải lên
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
