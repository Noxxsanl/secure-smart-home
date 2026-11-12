"use client";

import { useState } from "react";
import { RefreshCw, Tag } from "lucide-react";
import { InlineError, ModalShell, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from "@shh/ui";
import { errorMessage } from "@shh/api-client/dashboard";
import type { AiModelPrice, AiPriceInput } from "@shh/api-client/dashboard";
import { createPrice, updatePrice } from "../../api/aiUsage.api";

type PriceDialogProps = {
  /** null = thêm mới; có giá trị = sửa. */
  price: AiModelPrice | null;
  /** Gợi ý khi thêm giá cho model đang được gọi mà chưa có giá. */
  preset?: { provider: string; model: string };
  onClose: () => void;
  onSaved: (price: AiModelPrice) => void;
};

const FIELDS = [
  { key: "input_usd_per_mtok", label: "Token vào", hint: "USD / 1 triệu token" },
  { key: "output_usd_per_mtok", label: "Token ra", hint: "USD / 1 triệu token" },
  { key: "cached_input_usd_per_mtok", label: "Đọc cache", hint: "Bỏ trống = tính như token vào" },
  { key: "cache_write_usd_per_mtok", label: "Ghi cache", hint: "Anthropic; bỏ trống = như token vào" },
  { key: "audio_usd_per_minute", label: "Âm thanh (STT)", hint: "USD / phút — model nhận dạng giọng nói" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

function initialValues(price: AiModelPrice | null): Record<FieldKey, string> {
  const text = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return {
    input_usd_per_mtok: text(price?.input_usd_per_mtok),
    output_usd_per_mtok: text(price?.output_usd_per_mtok),
    cached_input_usd_per_mtok: text(price?.cached_input_usd_per_mtok),
    cache_write_usd_per_mtok: text(price?.cache_write_usd_per_mtok),
    audio_usd_per_minute: text(price?.audio_usd_per_minute),
  };
}

// Admin nhập giá theo trang giá chính thức của nhà cung cấp. Lượt gọi trước đó chưa có giá được backend tính bù.
export default function PriceDialog({ price, preset, onClose, onSaved }: PriceDialogProps) {
  const [provider, setProvider] = useState(price?.provider ?? preset?.provider ?? "openai");
  const [model, setModel] = useState(price?.model ?? preset?.model ?? "");
  const [values, setValues] = useState(() => initialValues(price));
  const [sourceUrl, setSourceUrl] = useState(price?.source === "manual" ? (price.source_url ?? "") : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function parse(): AiPriceInput | string {
    const out: Record<string, number | null> = {};
    for (const field of FIELDS) {
      const raw = values[field.key].trim().replace(",", ".");
      if (!raw) { out[field.key] = null; continue; }
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0 || num > 10_000) return `${field.label}: nhập số từ 0 đến 10.000 (dấu chấm thập phân).`;
      out[field.key] = num;
    }
    const hasTokens = out.input_usd_per_mtok !== null && out.output_usd_per_mtok !== null;
    if (!hasTokens && out.audio_usd_per_minute === null) {
      return "Nhập giá token vào và token ra, hoặc giá âm thanh/phút cho model nhận dạng giọng nói.";
    }
    const url = sourceUrl.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) return "Link nguồn giá phải bắt đầu bằng https://";
    return { ...(out as Omit<AiPriceInput, "source_url">), source_url: url || null };
  }

  async function submit() {
    if (submitting) return;
    if (!price) {
      if (!/^[a-z0-9][a-z0-9_.-]{0,31}$/.test(provider.trim())) { setError("Nhà cung cấp: chữ thường, số, _ . - (VD openai, anthropic, local)."); return; }
      if (!/^[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,127}$/.test(model.trim())) { setError("Tên model không hợp lệ — dùng đúng tên model khi gọi API (VD gpt-5-mini)."); return; }
    }
    const input = parse();
    if (typeof input === "string") { setError(input); return; }
    setSubmitting(true);
    setError("");
    try {
      const saved = price
        ? await updatePrice(price.id, input)
        : await createPrice({ ...input, provider: provider.trim(), model: model.trim() });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title={price ? "Sửa giá model" : "Thêm giá model"}
      subtitle={price ? `${price.provider} · ${price.model}` : "Giá theo trang giá chính thức của nhà cung cấp"}
      icon={Tag}
      busy={submitting}
      onSubmit={() => void submit()}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Lưu giá
          </button>
        </>
      }
    >
      {!price && (
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div>
            <label htmlFor="price-provider" className={LABEL}>Nhà cung cấp</label>
            <input id="price-provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={`${INPUT} font-mono`} />
          </div>
          <div>
            <label htmlFor="price-model" className={LABEL}>Model (đúng tên khi gọi API)</label>
            <input id="price-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="VD: gpt-5-mini" className={`${INPUT} font-mono`} />
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label htmlFor={`price-${field.key}`} className={LABEL}>{field.label}</label>
            <input
              id={`price-${field.key}`} inputMode="decimal" value={values[field.key]} placeholder="—"
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))} className={INPUT}
            />
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">{field.hint}</p>
          </div>
        ))}
      </div>
      <div>
        <label htmlFor="price-source" className={LABEL}>Link trang giá đã tra (tuỳ chọn)</label>
        <input id="price-source" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" className={INPUT} />
      </div>
      <p className="text-xs text-gray-500 dark:text-slate-400">
        Giá nhập tay được giữ nguyên khi bấm “Đồng bộ giá”. Chi phí các lượt gọi đã tính không đổi; lượt chưa có giá được tính bù.
      </p>
      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
