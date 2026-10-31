"use client";

import { api } from "@shh/api-client";
import { PORTAL_API, useApi } from "@shh/api-client/portal";
import type { AcceptSuggestionResult, AutomationHistoryEntry, AutomationRule, CreateAutomationInput, DismissSuggestionResult, HabitSuggestion, UpdateAutomationInput } from "@shh/api-client/portal";

export const automationsKey = (homeId: number) => `${PORTAL_API}/homes/${homeId}/automations`;
export const automationPrefix = `${PORTAL_API}/automations`;
export const ruleHistoryKey = (ruleId: number) => `${automationPrefix}/${ruleId}/history?limit=20`;
export const suggestionsKey = (homeId: number) => `${PORTAL_API}/homes/${homeId}/suggestions`;

/** GET /homes/:id/automations — GUEST nhận 403. */
export function useAutomations(homeId: number | null) {
  return useApi<AutomationRule[]>(homeId === null ? null : automationsKey(homeId), { revalidateOnFocus: true });
}

/** GET /automations/:id/history?limit=20 (FR-7.2). */
export function useRuleHistory(ruleId: number | null) {
  return useApi<AutomationHistoryEntry[]>(ruleId === null ? null : ruleHistoryKey(ruleId));
}

/** GET /homes/:id/suggestions — đang chờ + đã phản hồi trong 30 ngày. */
export function useSuggestions(homeId: number | null) {
  return useApi<HabitSuggestion[]>(homeId === null ? null : suggestionsKey(homeId), { revalidateOnFocus: true });
}

/** POST /homes/:id/automations (OWNER/CONTROLLER). */
export function createAutomation(homeId: number, input: CreateAutomationInput) {
  return api<AutomationRule>(automationsKey(homeId), { method: "POST", body: input });
}

/** PATCH /automations/:id — bật/tắt hoặc sửa (rule có can_edit). */
export function updateAutomation(ruleId: number, input: UpdateAutomationInput) {
  return api<AutomationRule>(`${automationPrefix}/${ruleId}`, { method: "PATCH", body: input });
}

/** DELETE /automations/:id (rule có can_delete). */
export function deleteAutomation(ruleId: number) {
  return api<void>(`${automationPrefix}/${ruleId}`, { method: "DELETE" });
}

/**
 * POST /suggestions/:id/accept — backend tạo rule lịch (origin ai_suggested)
 * trong cùng transaction. Gợi ý chưa chấp nhận không bao giờ điều khiển thiết bị (FR-7.5).
 */
export function acceptSuggestion(suggestionId: number) {
  return api<AcceptSuggestionResult>(`${PORTAL_API}/suggestions/${suggestionId}/accept`, { method: "POST" });
}

/** POST /suggestions/:id/dismiss — không gợi ý lại mẫu này trong 30 ngày (FR-7.6). */
export function dismissSuggestion(suggestionId: number) {
  return api<DismissSuggestionResult>(`${PORTAL_API}/suggestions/${suggestionId}/dismiss`, { method: "POST" });
}
