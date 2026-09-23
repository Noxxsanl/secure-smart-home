"use client";

import { BrainCircuit, Play, Download, Loader2, Sparkles } from "lucide-react";
import { useAiDashboard } from "@/features/ai/hooks/useAiDashboard";
import AIOverviewCards from "@/features/ai/components/AIOverviewCards";
import ModelStatus from "@/features/ai/components/ModelStatus";
import PredictionStats from "@/features/ai/components/PredictionStats";
import PredictionTable from "@/features/ai/components/PredictionTable";
import PredictionChart from "@/features/ai/components/PredictionChart";
import PredictionPie from "@/features/ai/components/PredictionPie";
import RecommendationPanel from "@/features/ai/components/RecommendationPanel";
import TrainingTimeline from "@/features/ai/components/TrainingTimeline";
import FeatureImportance from "@/features/ai/components/FeatureImportance";
import DatasetSummary from "@/features/ai/components/DatasetSummary";
import NotificationPanel from "@/features/ai/components/NotificationPanel";
import { useToast } from "@/shared/ui/Toast";
import type { AiRecommendation } from "@/shared/mock/ai";

export default function AiDashboardPage() {
  const {
    data, isLoading, trainingProgress, isTraining, isPredicting, isExporting,
    trainModel, runPrediction, exportReport, resolveRecommendation,
  } = useAiDashboard();
  const { showToast } = useToast();

  async function handleTrain() {
    const version = await trainModel();
    if (version) showToast(`Training completed — model ${version} đã được nạp vào runtime.`);
  }

  async function handleRunPrediction() {
    const count = await runPrediction();
    showToast(`Đã sinh ${count} dự đoán mới từ model hiện tại.`);
  }

  async function handleExport() {
    const fileName = await exportReport();
    showToast(`Export completed — ${fileName}`);
  }

  function handleResolve(recommendation: AiRecommendation, accepted: boolean) {
    resolveRecommendation(recommendation.id, accepted);
    showToast(
      accepted
        ? `Đã chấp nhận: ${recommendation.device} (${recommendation.room}) → ${recommendation.action}.`
        : `Đã bỏ qua gợi ý cho ${recommendation.device} (${recommendation.room}).`,
      accepted
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* 1 — Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <BrainCircuit className="h-4 w-4" />
            </span>
            AI Prediction Center
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            Monitor AI model performance and Smart Home predictions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTrain}
            disabled={isTraining}
            className="inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-60"
          >
            {isTraining
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Training… {trainingProgress}%</>
              : <><Sparkles className="h-3.5 w-3.5" /> Train Model</>}
          </button>
          <button
            type="button"
            onClick={handleRunPrediction}
            disabled={isPredicting}
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-200 transition hover:border-brand hover:bg-brand-soft hover:text-brand disabled:opacity-60"
          >
            {isPredicting
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…</>
              : <><Play className="h-3.5 w-3.5" /> Run Prediction</>}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-200 transition hover:border-brand hover:bg-brand-soft hover:text-brand disabled:opacity-60"
          >
            {isExporting
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting…</>
              : <><Download className="h-3.5 w-3.5" /> Export Report</>}
          </button>
        </div>
      </div>

      {/* 2 — AI Overview Cards */}
      <AIOverviewCards metrics={data?.overview ?? []} isLoading={isLoading} />

      {/* 3 — Model Status */}
      <ModelStatus
        status={data?.modelStatus ?? null}
        isLoading={isLoading}
        trainingProgress={trainingProgress}
        isTraining={isTraining}
      />

      {/* 4 — Prediction Statistics */}
      <PredictionStats stats={data?.predictionStats ?? []} isLoading={isLoading} />

      {/* 5 — AI Prediction Table */}
      <PredictionTable predictions={data?.predictions ?? []} isLoading={isLoading} />

      {/* 6 & 7 — Performance trend + device distribution */}
      <div className="grid gap-3 xl:grid-cols-2">
        <PredictionChart data={data?.accuracyTrend ?? []} isLoading={isLoading} />
        <PredictionPie data={data?.distribution ?? []} isLoading={isLoading} />
      </div>

      {/* 8 & 9 — Recommendations + training history */}
      <div className="grid gap-3 xl:grid-cols-2">
        <RecommendationPanel
          recommendations={data?.recommendations ?? []}
          isLoading={isLoading}
          onResolve={handleResolve}
        />
        <TrainingTimeline runs={data?.trainingHistory ?? []} isLoading={isLoading} />
      </div>

      {/* 10, 11 & 12 — Feature importance + dataset + notifications */}
      <div className="grid gap-3 xl:grid-cols-2">
        <FeatureImportance data={data?.featureImportance ?? []} isLoading={isLoading} />
        <div className="space-y-3">
          <DatasetSummary dataset={data?.dataset ?? null} isLoading={isLoading} />
          <NotificationPanel notifications={data?.notifications ?? []} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
