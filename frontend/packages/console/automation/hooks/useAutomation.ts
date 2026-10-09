"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import { automationKey, setAutomationEnabled } from "@smarthome/console/api/automation.api";
import type { AutomationRule } from "@smarthome/console/api/types";

/**
 * GET /automation?home_id= — rule của khách hàng, chỉ xem. Operator chỉ thấy nhà chưa
 * kích hoạt và nhà đang có quyền truy cập (backend lọc). Poll 10 s.
 * `setEnabled` (Admin) → PATCH /automation/:id { enabled }; ném lỗi để trang báo cho người dùng.
 */
export function useAutomation(homeId: number | null = null) {
  const { data, error, isLoading, isValidating, mutate } = useDashboardSWR<AutomationRule[]>(
    automationKey(homeId),
    { refreshInterval: 10_000, keepPreviousData: true }
  );

  async function setEnabled(rule: AutomationRule, enabled: boolean) {
    const updated = await setAutomationEnabled(rule.id, enabled);
    await mutate(
      (current) => current?.map((r) => (r.id === updated.id ? updated : r)),
      { revalidate: false }
    );
    return updated;
  }

  return {
    rules: data ?? [],
    isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
    setEnabled,
  };
}
