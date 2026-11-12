"use client";

import { dashApi, dashPath, revalidateDashboard, useDashboardSWR } from "@shh/api-client/dashboard";
import type {
  AiModelPrice, AiPriceInput, AiPriceList, AiPriceSyncResult, AiUsageCall, AiUsageRange, AiUsageSettings,
  AiUsageSummary,
} from "@shh/api-client/dashboard";

// /api/dashboard/ai-usage/** — số liệu dùng LLM/STT của AI Agent (module backend ai-usage).

const POLL_MS = 30_000;

export type CallFilter = { status?: "failed" | ""; model?: string };

export function useAiUsageSummary(range: AiUsageRange) {
  const { data, error, isLoading, mutate } = useDashboardSWR<AiUsageSummary>(
    dashPath("/ai-usage/summary", { range }),
    { refreshInterval: POLL_MS, keepPreviousData: true },
  );
  return { summary: data ?? null, error, isLoading, refresh: () => mutate() };
}

export function useAiUsageCalls(filter: CallFilter) {
  const { data, error, isLoading } = useDashboardSWR<AiUsageCall[]>(
    dashPath("/ai-usage/calls", { limit: 50, status: filter.status, model: filter.model }),
    { refreshInterval: POLL_MS, keepPreviousData: true },
  );
  return { calls: data ?? [], error, isLoading };
}

export function useAiPrices() {
  const { data, error, isLoading } = useDashboardSWR<AiPriceList>(dashPath("/ai-usage/prices"), {
    keepPreviousData: true,
  });
  return { list: data ?? null, error, isLoading };
}

/** Sau khi sửa giá / cài đặt: chi phí của lượt gọi chưa có giá được tính bù → tải lại cả tab. */
export function revalidateAiUsage() {
  return revalidateDashboard("/ai-usage");
}

// ── Chỉ Admin ──────────────────────────────────────────────────────────────

export function createPrice(input: AiPriceInput & { provider: string; model: string }) {
  return dashApi<AiModelPrice>("/ai-usage/prices", { method: "POST", body: input });
}

export function updatePrice(id: number, input: AiPriceInput) {
  return dashApi<AiModelPrice>(`/ai-usage/prices/${id}`, { method: "PUT", body: input });
}

export function deletePrice(id: number) {
  return dashApi<void>(`/ai-usage/prices/${id}`, { method: "DELETE" });
}

/** apply = false: chỉ xem trước thay đổi; true: ghi vào bảng giá. */
export function syncPrices(apply: boolean) {
  return dashApi<AiPriceSyncResult>("/ai-usage/prices/sync", { method: "POST", body: { apply } });
}

export function saveSettings(input: { daily_budget_usd: number | null; usd_to_vnd: number | null }) {
  return dashApi<AiUsageSettings>("/ai-usage/settings", { method: "PUT", body: input });
}
