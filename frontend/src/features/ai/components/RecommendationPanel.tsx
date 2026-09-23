"use client";

import { Lightbulb, Check, X, Power, PowerOff } from "lucide-react";
import AiSectionCard from "@/features/ai/components/AiSectionCard";
import DeviceCategoryIcon from "@/features/ai/components/DeviceCategoryIcon";
import ConfidenceMeter from "@/features/ai/components/ConfidenceMeter";
import EmptyState from "@/shared/ui/EmptyState";
import Skeleton from "@/shared/ui/Skeleton";
import type { AiRecommendation } from "@/shared/mock/ai";

type RecommendationPanelProps = {
  recommendations: AiRecommendation[];
  isLoading: boolean;
  onResolve: (recommendation: AiRecommendation, accepted: boolean) => void;
};

export default function RecommendationPanel({ recommendations, isLoading, onResolve }: RecommendationPanelProps) {
  return (
    <AiSectionCard
      title="AI Recommendation"
      subtitle="Gợi ý chờ xác nhận trước khi gửi lệnh xuống gateway."
      icon={Lightbulb}
      action={
        !isLoading && recommendations.length > 0 && (
          <span className="rounded bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
            {recommendations.length} pending
          </span>
        )
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-23 w-full rounded-lg" />)}
        </div>
      ) : recommendations.length === 0 ? (
        <EmptyState
          icon={Check}
          title="Đã xử lý hết gợi ý"
          description='Bấm "Run Prediction" để model sinh thêm đề xuất mới.'
        />
      ) : (
        <ul className="space-y-2">
          {recommendations.map((item) => {
            const isOn = item.action === "ON";
            return (
              <li
                key={item.id}
                className="rounded-lg border border-gray-100 dark:border-slate-700 p-3 transition-colors hover:border-brand/40 hover:bg-gray-50 dark:hover:bg-slate-700/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-slate-100">
                      <DeviceCategoryIcon category={item.category} />
                      {item.room} · {item.device}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{item.reason}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                    isOn ? "bg-success-soft text-success" : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400"
                  }`}>
                    {isOn ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                    Recommended {item.action}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <ConfidenceMeter value={item.confidence} />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onResolve(item, true)}
                      className="inline-flex items-center gap-1 rounded border border-success/20 bg-success-soft px-2.5 py-1 text-xs font-semibold text-success transition hover:brightness-95"
                    >
                      <Check className="h-3 w-3" /> Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => onResolve(item, false)}
                      className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:border-critical/30 hover:bg-critical-soft hover:text-critical"
                    >
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AiSectionCard>
  );
}
