"use client";

import { useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import { InlineError, ModalShell, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from "@shh/ui";
import { errorMessage } from "@shh/api-client/dashboard";
import type { AiUsageSettings } from "@shh/api-client/dashboard";
import { saveSettings } from "../../api/aiUsage.api";

type SettingsDialogProps = {
  settings: AiUsageSettings;
  onClose: () => void;
  onSaved: () => void;
};

function toText(value: number | null): string {
  return value === null ? "" : String(value);
}

function toNumber(text: string, label: string): number | null | string {
  const raw = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0 || num > 1_000_000) return `${label}: nhập số từ 0 đến 1.000.000.`;
  return num;
}

// Ngân sách USD/ngày (so với chi phí hôm nay) và tỷ giá USD→VNĐ để hiện thêm số tiền VNĐ. Chỉ Admin.
export default function SettingsDialog({ settings, onClose, onSaved }: SettingsDialogProps) {
  const [budget, setBudget] = useState(toText(settings.daily_budget_usd));
  const [rate, setRate] = useState(toText(settings.usd_to_vnd));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (submitting) return;
    const dailyBudget = toNumber(budget, "Ngân sách");
    if (typeof dailyBudget === "string") { setError(dailyBudget); return; }
    const usdToVnd = toNumber(rate, "Tỷ giá");
    if (typeof usdToVnd === "string") { setError(usdToVnd); return; }
    setSubmitting(true);
    setError("");
    try {
      await saveSettings({ daily_budget_usd: dailyBudget, usd_to_vnd: usdToVnd });
      onSaved();
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
      title="Ngân sách & tỷ giá"
      subtitle="Áp dụng cho tab AI Usage"
      icon={Wallet}
      busy={submitting}
      onSubmit={() => void submit()}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Lưu
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="ai-budget" className={LABEL}>Ngân sách mỗi ngày (USD)</label>
        <input id="ai-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="VD: 2" className={INPUT} />
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">
          Nên khớp AGENT_DAILY_BUDGET_USD trong agent/.env (agent tự chặn khi vượt). Bỏ trống = không theo dõi ngân sách.
        </p>
      </div>
      <div>
        <label htmlFor="ai-rate" className={LABEL}>Tỷ giá (VNĐ cho 1 USD)</label>
        <input id="ai-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="VD: 26000" className={INPUT} />
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">
          Nhập theo tỷ giá bán của ngân hàng bạn thanh toán thẻ. Bỏ trống = chỉ hiện USD.
        </p>
      </div>
      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
