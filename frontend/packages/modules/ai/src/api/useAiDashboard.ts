"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { aiStore, generateRandomPredictions } from "../model/mockData";
import type { AiDashboardSnapshot } from "../model/mockData";
import { runHabitSuggestions } from "./ai.api";
import type { HabitJobResult } from "@shh/api-client/dashboard";

// Toàn bộ số liệu model/dự đoán/gợi ý của trang AI Dashboard vẫn là DỮ LIỆU MÔ PHỎNG
// (aiStore) — backend chưa có pipeline AI thật. Duy nhất `analyzeHabits` gọi API thật:
// POST /api/dashboard/ai/suggestions/run (Admin) chạy ngay job phân tích thói quen.
function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

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
  /** Đang chờ backend chạy job phân tích thói quen (API thật). */
  isAnalyzingHabits: boolean;
  trainModel: () => Promise<string>;
  runPrediction: () => Promise<number>;
  exportReport: () => Promise<string>;
  /** POST /ai/suggestions/run — ném FetchError khi backend từ chối (trang dịch ra tiếng Việt). */
  analyzeHabits: () => Promise<HabitJobResult>;
  resolveRecommendation: (id: number, accepted: boolean) => void;
};

export function useAiDashboard(): UseAiDashboard {
  const { data, isLoading, mutate } = useSWR(
    "/mock/ai/dashboard",
    () => delay(aiStore.snapshot(), 400)
  );

  const [trainingProgress, setTrainingProgress] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAnalyzingHabits, setIsAnalyzingHabits] = useState(false);
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
    await delay(null, 600);
    aiStore.addPredictions(rows);
    await mutate();
    setIsPredicting(false);
    return rows.length;
  }, [mutate]);

  const exportReport = useCallback(async () => {
    setIsExporting(true);
    const fileName = `ai-report-${new Date().toISOString().slice(0, 10)}.csv`;
    await delay(null, 700);
    setIsExporting(false);
    return fileName;
  }, []);

  const analyzeHabits = useCallback(async () => {
    setIsAnalyzingHabits(true);
    try {
      return await runHabitSuggestions();
    } finally {
      setIsAnalyzingHabits(false);
    }
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
    isAnalyzingHabits,
    trainModel,
    runPrediction,
    exportReport,
    analyzeHabits,
    resolveRecommendation,
  };
}
