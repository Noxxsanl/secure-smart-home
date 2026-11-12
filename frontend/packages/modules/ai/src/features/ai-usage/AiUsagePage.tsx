"use client";

import { useState } from "react";
import {
  AlertTriangle, BrainCircuit, Clock, Coins, Hash, Plus, RefreshCw, Wallet, Zap,
} from "lucide-react";
import {
  ConfirmModal, LoadErrorBar, ModalShell, Panel, PanelEmpty, ProgressBar, StatsCard, useToast, BTN_PRIMARY,
  BTN_SECONDARY, BTN_SM, SELECT_SM,
} from "@shh/ui";
import { errorMessage } from "@shh/api-client/dashboard";
import type { AiModelPrice, AiPriceSyncResult, AiUsageRange } from "@shh/api-client/dashboard";
import { useAuth } from "@shh/auth";
import {
  deletePrice, revalidateAiUsage, syncPrices, useAiPrices, useAiUsageCalls, useAiUsageSummary,
} from "../../api/aiUsage.api";
import {
  RANGE_LABELS, formatInt, formatMs, formatPercent, formatPrice, formatTokens, formatUsd, formatVnd,
} from "../../model/format";
import { CostChart, LatencyChart, TokenChart } from "../../ui/UsageCharts";
import { CallsTable, HomeUsageTable, ModelUsageTable, PriceTable, PurposeUsageTable } from "../../ui/UsageTables";
import PriceDialog from "./PriceDialog";
import SettingsDialog from "./SettingsDialog";

const RANGES: AiUsageRange[] = ["24h", "7d", "30d"];

type PriceEdit = { price: AiModelPrice | null; preset?: { provider: string; model: string } };

// Tab AI Usage (Admin + Operator xem; bảng giá, ngân sách, tỷ giá chỉ Admin sửa). Số liệu thật do AI Agent gửi về
// (POST /api/service/ai-usage) — không có dữ liệu mẫu; chưa có lượt gọi nào thì hiện hướng dẫn kết nối.
export default function AiUsagePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { showToast } = useToast();

  const [range, setRange] = useState<AiUsageRange>("7d");
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const [priceEdit, setPriceEdit] = useState<PriceEdit | null>(null);
  const [priceDelete, setPriceDelete] = useState<AiModelPrice | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<AiPriceSyncResult | null>(null);

  const { summary, error, isLoading, refresh } = useAiUsageSummary(range);
  const { calls } = useAiUsageCalls({ status: onlyFailed ? "failed" : "", model: modelFilter || undefined });
  const { list: priceList, error: priceError } = useAiPrices();

  const totals = summary?.totals;
  const settings = summary?.settings ?? { daily_budget_usd: null, usd_to_vnd: null, updated_at: null };
  const rate = settings.usd_to_vnd;
  const placeholder = isLoading && !summary;
  const hasData = (totals?.calls ?? 0) > 0;
  const budget = settings.daily_budget_usd;
  const todayCost = summary?.today.cost_usd ?? 0;
  const budgetPercent = budget && budget > 0 ? Math.min(100, (todayCost / budget) * 100) : 0;

  // Bước 1: xem trước (không ghi). Bước 2: Admin bấm "Áp dụng" trong hộp thoại.
  async function runSync(apply: boolean) {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncPrices(apply);
      setSyncResult(result);
      if (apply) {
        void revalidateAiUsage();
        showToast(`Đã áp dụng ${result.changes.length} thay đổi giá.`);
      }
    } catch (err) {
      showToast(errorMessage(err), false);
    } finally {
      setSyncing(false);
    }
  }

  const vnd = (usd: number | null | undefined) => formatVnd(usd, rate);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">AI Usage</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            Chi phí, token, độ trễ và lỗi mỗi khi AI Agent gọi LLM / nhận dạng giọng nói. Không lưu nội dung hội thoại.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded border border-gray-200 dark:border-slate-600 p-0.5" role="group" aria-label="Khoảng thời gian">
            {RANGES.map((r) => (
              <button
                key={r} type="button" onClick={() => setRange(r)} aria-pressed={range === r}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition ${range === r
                  ? "bg-brand text-white" : "text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"}`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button type="button" onClick={() => setSettingsOpen(true)} className={BTN_SECONDARY}>
              <Wallet className="h-3.5 w-3.5" /> Ngân sách & tỷ giá
            </button>
          )}
        </div>
      </div>

      {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatsCard
          title={`Chi phí ${RANGE_LABELS[range]}`} value={placeholder ? "—" : formatUsd(totals?.cost_usd)}
          subtitle={[vnd(totals?.cost_usd), totals?.unpriced_calls ? `${formatInt(totals.unpriced_calls)} lượt chưa có giá` : null].filter(Boolean).join(" · ") || "Theo bảng giá model bên dưới."}
          accent="bg-brand-soft text-brand" iconBg="bg-brand-soft" icon={<Coins className="h-4 w-4 text-brand" />}
        />
        <StatsCard
          title="Lượt gọi LLM" value={placeholder ? "—" : formatInt(totals?.calls ?? 0)}
          subtitle={`${formatInt(totals?.requests ?? 0)} yêu cầu · lỗi ${formatPercent(totals?.error_rate ?? 0)}`}
          accent="bg-brand-soft text-brand" iconBg="bg-brand-soft" icon={<Hash className="h-4 w-4 text-brand" />}
        />
        <StatsCard
          title="Token" value={placeholder ? "—" : formatTokens(totals?.total_tokens ?? 0)}
          subtitle={`Vào ${formatTokens(totals?.input_tokens ?? 0)} (cache ${formatTokens(totals?.cached_input_tokens ?? 0)}) · ra ${formatTokens(totals?.output_tokens ?? 0)}`}
          accent="bg-brand-soft text-brand" iconBg="bg-brand-soft" icon={<BrainCircuit className="h-4 w-4 text-brand" />}
        />
        <StatsCard
          title="Độ trễ trung bình" value={placeholder ? "—" : formatMs(totals?.avg_latency_ms)}
          subtitle={`p50 ${formatMs(totals?.p50_latency_ms)} · p95 ${formatMs(totals?.p95_latency_ms)}${totals?.avg_ttft_ms != null ? ` · token đầu ${formatMs(totals.avg_ttft_ms)}` : ""}`}
          accent="bg-success-soft text-success" iconBg="bg-success-soft" icon={<Clock className="h-4 w-4 text-success" />}
        />
        <StatsCard
          title="Chi phí / yêu cầu" value={placeholder ? "—" : formatUsd(totals?.cost_per_request_usd)}
          subtitle={vnd(totals?.cost_per_request_usd) ?? "Trung bình mỗi câu lệnh của người dùng."}
          accent="bg-success-soft text-success" iconBg="bg-success-soft" icon={<Zap className="h-4 w-4 text-success" />}
        />
      </div>

      {/* Ngân sách hôm nay */}
      <Panel title="Hôm nay" subtitle="Từ 00:00 giờ Việt Nam">
        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-gray-700 dark:text-slate-300">
              <span className="text-lg font-semibold text-gray-900 dark:text-slate-100">{formatUsd(todayCost)}</span>
              {vnd(todayCost) && <span className="ml-1.5 text-gray-500 dark:text-slate-400">({vnd(todayCost)})</span>}
              <span className="ml-1.5 text-gray-500 dark:text-slate-400">· {formatInt(summary?.today.calls ?? 0)} lượt gọi</span>
            </span>
            <span className="text-xs text-gray-500 dark:text-slate-400">
              {budget ? `Ngân sách ${formatUsd(budget)}/ngày${vnd(budget) ? ` (${vnd(budget)})` : ""}` : "Chưa đặt ngân sách ngày"}
            </span>
          </div>
          {budget ? (
            <>
              <ProgressBar percent={budgetPercent} colorClassName={budgetPercent >= 100 ? "bg-critical" : budgetPercent >= 80 ? "bg-warning" : "bg-brand"} />
              {budgetPercent >= 80 && (
                <p className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {budgetPercent >= 100 ? "Đã chạm ngân sách ngày." : `Đã dùng ${Math.round(budgetPercent)}% ngân sách ngày.`}
                  {" "}Agent tự chặn theo AGENT_DAILY_BUDGET_USD trong agent/.env — nên đặt cùng giá trị.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400 dark:text-slate-500">
              {isAdmin ? "Bấm “Ngân sách & tỷ giá” để đặt ngân sách theo ngày." : "Admin chưa đặt ngân sách theo ngày."}
            </p>
          )}
        </div>
      </Panel>

      {(summary?.unpriced_models.length ?? 0) > 0 && (
        <div className="flex items-start gap-2.5 rounded border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Model đang được gọi nhưng chưa có giá nên chưa tính được chi phí:{" "}
            <span className="font-mono">{summary!.unpriced_models.map((m) => `${m.provider}/${m.model}`).join(", ")}</span>.{" "}
            {isAdmin ? "Thêm giá ở bảng giá bên dưới (hoặc Đồng bộ giá)." : "Nhờ Admin thêm giá."}
          </p>
        </div>
      )}

      {!placeholder && !hasData ? (
        <Panel title="Chưa có số liệu">
          <div className="space-y-1.5 p-4 text-sm text-gray-600 dark:text-slate-300">
            <p>Chưa có lượt gọi AI nào trong {RANGE_LABELS[range].toLowerCase()} qua. Số liệu tự xuất hiện khi AI Agent gọi LLM:</p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-500 dark:text-slate-400">
              <li>Backend: đặt <span className="font-mono">SERVICE_API_TOKEN</span> (≥ 32 ký tự) trong <span className="font-mono">backend/.env</span>.</li>
              <li>Agent: đặt <span className="font-mono">BACKEND_SERVICE_TOKEN</span> cùng giá trị trong <span className="font-mono">agent/.env</span>; planner bọc mỗi lần gọi LLM bằng <span className="font-mono">track_llm_call(...)</span>.</li>
              <li>Chi phí tính theo bảng giá model bên dưới; ngân sách và tỷ giá do Admin đặt.</li>
            </ul>
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-3">
            <CostChart series={summary?.series ?? []} />
            <TokenChart series={summary?.series ?? []} />
            <LatencyChart series={summary?.series ?? []} />
          </div>

          <Panel title="Theo model" subtitle="Lỗi = lỗi + quá thời gian. Độ trễ: trung bình / p95.">
            {(summary?.by_model.length ?? 0) === 0 ? <PanelEmpty>Chưa có lượt gọi.</PanelEmpty> : <ModelUsageTable rows={summary!.by_model} />}
          </Panel>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Theo mục đích">
              {(summary?.by_purpose.length ?? 0) === 0 ? <PanelEmpty>Chưa có lượt gọi.</PanelEmpty> : <PurposeUsageTable rows={summary!.by_purpose} />}
            </Panel>
            <Panel title="Nhà dùng AI nhiều nhất" subtitle="Top 5 theo chi phí">
              {(summary?.top_homes.length ?? 0) === 0 ? <PanelEmpty>Chưa có lượt gọi gắn với nhà nào.</PanelEmpty> : <HomeUsageTable rows={summary!.top_homes} />}
            </Panel>
          </div>

          <Panel
            title="Lượt gọi gần đây"
            subtitle="50 lượt mới nhất — chỉ số liệu kỹ thuật, không có nội dung hội thoại."
            action={
              <div className="flex items-center gap-2">
                <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className={SELECT_SM} aria-label="Lọc theo model">
                  <option value="">Mọi model</option>
                  {(summary?.by_model ?? []).map((m) => <option key={`${m.provider}/${m.model}`} value={m.model}>{m.model}</option>)}
                </select>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300">
                  <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} /> Chỉ lỗi
                </label>
              </div>
            }
          >
            {calls.length === 0 ? <PanelEmpty>Không có lượt gọi phù hợp.</PanelEmpty> : <CallsTable rows={calls} />}
          </Panel>
        </>
      )}

      {/* Bảng giá */}
      <Panel
        title="Bảng giá model"
        subtitle="USD / 1 triệu token (STT: USD / phút). Giá mặc định tra từ trang giá chính thức của OpenAI và Anthropic."
        action={isAdmin ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void runSync(false)} disabled={syncing} className={BTN_SM} title={priceList?.sync_source_url}>
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Đang đồng bộ…" : "Đồng bộ giá"}
            </button>
            <button type="button" onClick={() => setPriceEdit({ price: null })} className={BTN_SM}>
              <Plus className="h-3 w-3" /> Thêm giá
            </button>
          </div>
        ) : undefined}
      >
        {!!priceError && <LoadErrorBar error={priceError} />}
        {isAdmin && (priceList?.unpriced_models.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 dark:border-slate-700 px-4 py-2 text-xs">
            <span className="text-gray-500 dark:text-slate-400">Chưa có giá:</span>
            {priceList!.unpriced_models.map((m) => (
              <button
                key={`${m.provider}/${m.model}`} type="button"
                onClick={() => {
                  // Đã có dòng giá nhưng thiếu trường (VD chỉ có giá âm thanh) → sửa dòng đó thay vì thêm trùng
                  const existing = m.price_id !== null ? priceList!.prices.find((p) => p.id === m.price_id) : undefined;
                  setPriceEdit(existing ? { price: existing } : { price: null, preset: m });
                }}
                className="rounded border border-warning/40 px-2 py-0.5 font-mono text-warning hover:bg-warning-soft"
              >
                + {m.provider}/{m.model}
              </button>
            ))}
          </div>
        )}
        {(priceList?.prices.length ?? 0) === 0
          ? <PanelEmpty>Chưa có giá model nào.</PanelEmpty>
          : <PriceTable rows={priceList!.prices} canEdit={isAdmin} onEdit={(p) => setPriceEdit({ price: p })} onDelete={setPriceDelete} />}
        <p className="border-t border-gray-100 dark:border-slate-700 px-4 py-2 text-[11px] text-gray-400 dark:text-slate-500">
          “Đồng bộ giá” lấy từ kho giá công khai LiteLLM (tổng hợp theo trang giá từng nhà cung cấp); giá Admin nhập tay được giữ.
          Chi phí mỗi lượt gọi được chốt theo giá lúc phát sinh.
        </p>
      </Panel>

      {priceEdit && (
        <PriceDialog
          price={priceEdit.price}
          preset={priceEdit.preset}
          onClose={() => setPriceEdit(null)}
          onSaved={(p) => { void revalidateAiUsage(); showToast(`Đã lưu giá ${p.model}.`); }}
        />
      )}
      {priceDelete && (
        <ConfirmModal
          title="Xoá giá model?"
          subtitle={`${priceDelete.provider} · ${priceDelete.model}`}
          danger
          confirmLabel="Xoá giá"
          description={<p>Lượt gọi mới của model này sẽ không tính được chi phí cho tới khi có giá lại. Chi phí đã tính của các lượt cũ giữ nguyên.</p>}
          onConfirm={async () => { await deletePrice(priceDelete.id); void revalidateAiUsage(); showToast(`Đã xoá giá ${priceDelete.model}.`); }}
          onClose={() => setPriceDelete(null)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => { void revalidateAiUsage(); showToast("Đã lưu ngân sách và tỷ giá."); }}
        />
      )}
      {syncResult && (
        <ModalShell
          open
          onClose={() => setSyncResult(null)}
          title={syncResult.applied ? "Đã đồng bộ giá" : "Xem trước đồng bộ giá"}
          subtitle={syncResult.source_url}
          icon={RefreshCw}
          busy={syncing}
          footer={syncResult.applied || syncResult.changes.length === 0
            ? <button type="button" onClick={() => setSyncResult(null)} className={BTN_PRIMARY}>Đóng</button>
            : (
              <>
                <button type="button" onClick={() => setSyncResult(null)} disabled={syncing} className={BTN_SECONDARY}>Huỷ</button>
                <button type="button" onClick={() => void runSync(true)} disabled={syncing} className={BTN_PRIMARY}>
                  {syncing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Áp dụng {syncResult.changes.length} thay đổi
                </button>
              </>
            )}
        >
          <div className="space-y-2 text-sm text-gray-700 dark:text-slate-300">
            {!syncResult.applied && syncResult.changes.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Chưa có gì được ghi. Kiểm tra từng giá với trang giá chính thức trước khi áp dụng; giá Admin nhập tay không bị đổi.
              </p>
            )}
            {syncResult.changes.length === 0
              ? <p>Không có giá nào thay đổi.</p>
              : (
                <ul className="space-y-1">
                  {syncResult.changes.map((c) => (
                    <li key={`${c.provider}/${c.model}`}>
                      <span className="font-mono text-xs">{c.provider}/{c.model}</span>{" "}
                      {c.action === "added" ? "— thêm mới" : "— cập nhật"}:{" "}
                      vào {formatPrice(c.after.inputUsdPerMtok)}, ra {formatPrice(c.after.outputUsdPerMtok)}
                      {c.before && ` (trước: ${formatPrice(c.before.inputUsdPerMtok)} / ${formatPrice(c.before.outputUsdPerMtok)})`}
                    </li>
                  ))}
                </ul>
              )}
            {syncResult.not_found.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-slate-400">Nguồn không có: <span className="font-mono">{syncResult.not_found.join(", ")}</span> — giữ giá hiện tại.</p>
            )}
            {syncResult.skipped_manual.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-slate-400">Giữ giá Admin nhập: <span className="font-mono">{syncResult.skipped_manual.join(", ")}</span>.</p>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  );
}
