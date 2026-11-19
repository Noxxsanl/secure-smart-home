import { dashApi, dashPath } from "@shh/api-client/dashboard";
import type { AutomationRule } from "@shh/api-client/dashboard";

// §5 Automation — staff chỉ xem; Admin được bật/tắt (rule do khách tạo trên app).

export function automationKey(homeId?: number | null) {
  return dashPath("/automation", { home_id: homeId });
}

export function setAutomationEnabled(id: number, enabled: boolean) {
  return dashApi<AutomationRule>(`/automation/${id}`, { method: "PATCH", body: { enabled } });
}
