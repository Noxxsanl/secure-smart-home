import { dashApi, dashPath } from "@smarthome/console/api/client";
import type { AutomationRule } from "@smarthome/console/api/types";

// §5 Automation — staff chỉ xem; Admin được bật/tắt (rule do khách tạo trên app).

export function automationKey(homeId?: number | null) {
  return dashPath("/automation", { home_id: homeId });
}

export function setAutomationEnabled(id: number, enabled: boolean) {
  return dashApi<AutomationRule>(`/automation/${id}`, { method: "PATCH", body: { enabled } });
}
