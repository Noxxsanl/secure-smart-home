import { dashApi, dashPath } from "@smarthome/console/api/client";
import type { LogCategory, LogFilters } from "@smarthome/console/api/types";

// §5 Logs (FR-10.1, 10.3, 10.4). Operator chỉ đọc 5 loại (gateway, device,
// provision, automation, ota) — loại khác backend trả 403.

export const LOG_PAGE_LIMIT = 50;

export function logsKey(category: LogCategory, filters: LogFilters = {}) {
  return dashPath(`/logs/${category}`, {
    home_id: filters.home_id,
    severity: filters.severity,
    from: filters.from,
    to: filters.to,
    actor: filters.actor?.trim(),
    q: filters.q?.trim(),
    page: filters.page ?? 1,
    limit: filters.limit ?? LOG_PAGE_LIMIT,
  });
}

/** Chỉ Admin. Backend ghi audit LOGS_DELETED (không xoá chính dòng audit đó). */
export function deleteLogs(category: LogCategory, ids: number[]) {
  return dashApi<void>(`/logs/${category}`, { method: "DELETE", body: { ids } });
}
