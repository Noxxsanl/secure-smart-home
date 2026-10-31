"use client";

import { useRuleHistory } from "../../api/portalAutomation.api";
import type { AutomationHistoryEntry } from "@shh/api-client/portal";
import { historyDetailText } from "../../model/history";
import { formatDateTime } from "@shh/utils";
import { ErrorPanel } from "@shh/ui";

const RESULT_STYLE: Record<AutomationHistoryEntry["result"], { label: string; className: string }> = {
  success: { label: "Thành công", className: "bg-success-soft text-success ring-1 ring-success/30" },
  failed: { label: "Thất bại", className: "bg-critical-soft text-critical ring-1 ring-critical/30" },
  skipped: { label: "Bỏ qua", className: "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-600" },
};

// GET /automations/:id/history?limit=20 — 20 lần chạy gần nhất của một quy tắc (FR-7.2).
export default function RuleHistory({ ruleId }: { ruleId: number }) {
  const { data, error, mutate } = useRuleHistory(ruleId);

  if (!data) {
    if (error) return <ErrorPanel error={error} onRetry={() => mutate()} />;
    return <p className="text-xs text-gray-400 dark:text-slate-500">Đang tải lịch sử…</p>;
  }

  if (data.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-slate-500">Quy tắc này chưa chạy lần nào.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100 dark:divide-slate-700" aria-label="Lịch sử chạy của quy tắc">
      {data.map((entry) => {
        const style = RESULT_STYLE[entry.result];
        const detail = historyDetailText(entry.details);
        return (
          <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-xs">
            <span className="w-32 shrink-0 text-gray-500 dark:text-slate-400">{formatDateTime(entry.triggered_at)}</span>
            <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${style.className}`}>{style.label}</span>
            {detail && <span className="min-w-0 flex-1 text-gray-500 dark:text-slate-400">{detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}
