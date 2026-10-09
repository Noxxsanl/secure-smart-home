"use client";

import { FormEvent, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

type InlineEditProps = {
  value: string;
  /** Lưu giá trị mới; trả về thông điệp lỗi (đã dịch) hoặc null khi thành công. */
  onSave: (next: string) => Promise<string | null>;
  canEdit: boolean;
  /** Nhãn cho nút / ô nhập, VD "Đổi tên phòng". */
  label: string;
  maxLength?: number;
  /** Class cho chữ hiển thị (cỡ chữ, đậm...). */
  textClassName?: string;
};

// Đổi tên tại chỗ (FR-5.7): bấm bút chì → ô nhập + Lưu / Huỷ; Enter lưu, Esc huỷ.
export default function InlineEdit({
  value, onSave, canEdit, label, maxLength = 64, textClassName = "",
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setDraft(value);
    setError("");
    setEditing(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (!next) {
      setError("Tên không được để trống.");
      return;
    }
    if (next.length > maxLength) {
      setError(`Tên tối đa ${maxLength} ký tự.`);
      return;
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const failure = await onSave(next);
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className={`truncate ${textClassName}`}>{value}</span>
        {canEdit && (
          <button
            type="button"
            onClick={start}
            aria-label={label}
            title={label}
            className="shrink-0 rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label={label}
          disabled={saving}
          className="h-8 min-w-0 flex-1 rounded border border-gray-200 bg-white px-2.5 text-sm text-gray-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={saving}
          aria-label="Lưu"
          className="rounded bg-brand p-1.5 text-white transition hover:brightness-90 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setEditing(false)}
          aria-label="Huỷ"
          className="rounded border border-gray-200 p-1.5 text-gray-500 transition hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-critical">{error}</p>}
    </form>
  );
}
