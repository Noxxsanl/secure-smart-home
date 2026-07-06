import useSWR from "swr";
import type { AuditLogEntry } from "@/shared/types/api";
import api from "@/shared/api/client";

export type AuditLogFilters = {
  event_type?: string;
  device_id?: string;
  from?: string;
  to?: string;
};

function buildQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters.event_type) params.set("event_type", filters.event_type);
  if (filters.device_id) params.set("device_id", filters.device_id);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const q = params.toString();
  return q ? `/api/audit-log?${q}` : "/api/audit-log";
}

const fetcher = (url: string) =>
  api.get<{ audit_log: AuditLogEntry[] }>(url).then((r) => r.data.audit_log);

export function useAuditLog(filters: AuditLogFilters = {}) {
  const key = buildQuery(filters);
  // Làm mới mỗi 30 giây – audit log chỉ ghi thêm và tần suất thấp, nên interval ngắn hơn
  // sẽ lãng phí mà không cải thiện độ tươi có ý nghĩa cho việc review bảo mật.
  const { data, error, isLoading, mutate } = useSWR<AuditLogEntry[]>(
    key,
    fetcher,
    { refreshInterval: 30000 }
  );

  return {
    logs: data ?? [],
    isLoading,
    isError: !!error,
    refresh: mutate,
  };
}
