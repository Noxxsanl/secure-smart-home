"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { mockDelay } from "@/shared/mock/store";
import { aiStore, generateRandomPredictions } from "@/shared/mock/ai";
import type { AiDashboardSnapshot } from "@/shared/mock/ai";

const TRAIN_TICK_MS = 220;
const TRAIN_STEP = 7;

export type UseAiDashboard = {
  data: AiDashboardSnapshot | null;
  isLoading: boolean;
  /** Live 0–100 while a mock training round is running. */
  trainingProgress: number;
  isTraining: boolean;
  isPredicting: boolean;
  isExporting: boolean;
  trainModel: () => Promise<string>;
  runPrediction: () => Promise<number>;
  exportReport: () => Promise<string>;
  resolveRecommendation: (id: number, accepted: boolean) => void;
};

export function useAiDashboard(): UseAiDashboard {
  const { data, isLoading, mutate } = useSWR(
    "/mock/ai/dashboard",
    () => mockDelay(aiStore.snapshot(), 400)
  );

  const [trainingProgress, setTrainingProgress] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // A training round is a ticking interval, not a request — clear it if the
  // user navigates away mid-run so it can't keep setting state after unmount.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const trainModel = useCallback(() => {
    if (isTraining) return Promise.resolve("");
    setIsTraining(true);
    setTrainingProgress(0);

    let progress = 0;
    return new Promise<string>((resolve) => {
      timerRef.current = setInterval(() => {
        progress = Math.min(100, progress + TRAIN_STEP);
        setTrainingProgress(progress);
        if (progress < 100) return;

        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        const status = aiStore.completeTraining();
        void mutate();
        setIsTraining(false);
        resolve(status.version);
      }, TRAIN_TICK_MS);
    });
  }, [isTraining, mutate]);

  const runPrediction = useCallback(async () => {
    setIsPredicting(true);
    const rows = generateRandomPredictions(5);
    await mockDelay(null, 600);
    aiStore.addPredictions(rows);
    await mutate();
    setIsPredicting(false);
    return rows.length;
  }, [mutate]);

  const exportReport = useCallback(async () => {
    setIsExporting(true);
    const fileName = `ai-report-${new Date().toISOString().slice(0, 10)}.csv`;
    await mockDelay(null, 700);
    setIsExporting(false);
    return fileName;
  }, []);

  const resolveRecommendation = useCallback((id: number, accepted: boolean) => {
    aiStore.resolveRecommendation(id, accepted);
    void mutate();
  }, [mutate]);

  return {
    data: data ?? null,
    isLoading,
    trainingProgress,
    isTraining,
    isPredicting,
    isExporting,
    trainModel,
    runPrediction,
    exportReport,
    resolveRecommendation,
  };
}
