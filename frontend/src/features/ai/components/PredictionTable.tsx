"use client";

import { useMemo, useState } from "react";
import { ListChecks, Power, PowerOff, Search } from "lucide-react";
import AiSectionCard from "@/features/ai/components/AiSectionCard";
import DeviceCategoryIcon from "@/features/ai/components/DeviceCategoryIcon";
import ConfidenceMeter from "@/features/ai/components/ConfidenceMeter";
import StatusBadge from "@/shared/ui/StatusBadge";
import EmptyState from "@/shared/ui/EmptyState";
import Skeleton from "@/shared/ui/Skeleton";
import type { AiPrediction, AiPredictionStatus } from "@/shared/mock/ai";

const STATUS_BADGE: Record<AiPredictionStatus, { status: string; label: string }> = {
  success: { status: "completed",   label: "Success" },
  pending: { status: "pending",     label: "Waiting" },
  failed:  { status: "rolled_back", label: "Skipped" },
};

const FILTERS: { key: "all" | AiPredictionStatus; label: string }[] = [
  { key: "all",     label: "All" },
  { key: "success", label: "Success" },
  { key: "pending", label: "Waiting" },
  { key: "failed",  label: "Skipped" },
];

const TH = "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400";

type PredictionTableProps = {
  predictions: AiPrediction[];
  isLoading: boolean;
};

export default function PredictionTable({ predictions, isLoading }: PredictionTableProps) {
  const [filter, setFilter] = useState<"all" | AiPredictionStatus>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return predictions.filter((p) => {
      const matchesStatus = filter === "all" || p.status === filter;
      const matchesQuery = !needle
        || p.room.toLowerCase().includes(needle)
        || p.device.toLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [predictions, filter, query]);

  return (
    <AiSectionCard
      title="AI Prediction Table"
      subtitle="Các suy luận gần nhất do model sinh ra cho toàn bộ Smart Home."
      icon={ListChecks}
      bodyClassName="p-0"
      action={
        <span className="hidden rounded bg-gray-100 dark:bg-slate-700 px-2 py-0.5 font-mono text-[11px] text-gray-500 dark:text-slate-400 sm:inline">
          {rows.length}/{predictions.length}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-slate-700 px-4 py-2.5">
        <div className="flex items-center rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5 gap-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                filter === f.key
                  ? "bg-brand-soft text-brand"
                  : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo phòng hoặc thiết bị…"
            className="h-8 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 pl-8 pr-2.5 text-xs text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ListChecks} title="Không có dự đoán phù hợp" description="Thử đổi bộ lọc hoặc từ khoá tìm kiếm." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900">
                <th className={TH}>Time</th>
                <th className={TH}>Room</th>
                <th className={TH}>Device</th>
                <th className={TH}>Prediction</th>
                <th className={TH}>Confidence</th>
                <th className={TH}>Action</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {rows.map((row) => {
                const badge = STATUS_BADGE[row.status];
                const isOn = row.prediction === "Turn ON";
                return (
                  <tr key={row.id} className="bg-white dark:bg-slate-800 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">{row.time}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300">{row.room}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-slate-100">
                        <DeviceCategoryIcon category={row.category} />
                        {row.device}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                        isOn ? "bg-success-soft text-success" : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400"
                      }`}>
                        {isOn ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                        {row.prediction}
                      </span>
                    </td>
                    <td className="px-4 py-2.5"><ConfidenceMeter value={row.confidence} /></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-500 dark:text-slate-400">{row.action}</td>
                    <td className="whitespace-nowrap px-4 py-2.5"><StatusBadge status={badge.status} label={badge.label} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AiSectionCard>
  );
}
