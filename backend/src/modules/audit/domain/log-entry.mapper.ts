// Dòng audit_log (đã JOIN tên nhà/thiết bị/người thực hiện) → LogEntry của Dashboard.
import { toIsoRequired } from "../../../infrastructure/database/db";
import type { Severity } from "../../../shared/types/domain";
import type { LogCategory } from "./event-catalog";
import type { LogEntry } from "./log-entry.types";
import { TIMELINE_FALLBACK_LABEL, timelineLabel } from "./timeline";

export interface LogRow {
  id: number;
  category: LogCategory;
  severity: Severity;
  event_type: string;
  created_at: Date;
  home_id: number | null;
  home_name: string | null;
  gateway_uid: string | null;
  device_uid: string | null;
  actor_username: string | null;
  ip_address: string | null;
  message: string | null;
  details: unknown;
}

function parseDetails(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (Buffer.isBuffer(parsed)) parsed = parsed.toString("utf8");
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}

export function toLogEntry(row: LogRow): LogEntry {
  const label = timelineLabel(row.event_type);
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    event_type: row.event_type,
    timestamp: toIsoRequired(row.created_at),
    home_id: row.home_id,
    home_name: row.home_name,
    gateway_uid: row.gateway_uid,
    device_uid: row.device_uid,
    actor_username: row.actor_username,
    ip_address: row.ip_address,
    // Dòng cũ (trước V2) chưa có message: dùng nhãn nếu biết, ngược lại hiện mã sự kiện
    message: row.message ?? (label === TIMELINE_FALLBACK_LABEL ? row.event_type : label),
    details: parseDetails(row.details),
  };
}
