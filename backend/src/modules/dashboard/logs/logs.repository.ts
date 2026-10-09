// SQL của Log Center (audit_log). Mọi truy vấn log của Dashboard đi qua đây để LogEntry luôn cùng hình dạng.
import pool from "../../../config/db";
import { placeholders, queryOne, queryRows, runSql, sqlLimit, toCount, toIsoRequired, type SqlParam } from "../../../lib/db";
import type { Severity } from "../../../types/domain";
import type { LogCategory } from "../../logs/eventCatalog";
import { TIMELINE_FALLBACK_LABEL, timelineLabel } from "../../homes/timeline";
import { likePattern } from "../common/staff";
import type { LogEntry } from "../dashboard.types";

interface LogRow {
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

// Alias: a = audit_log, h = nhà, d = thiết bị, gw = gateway của node, u = người thực hiện (nhân viên hoặc khách).
export const LOG_SELECT_SQL = `
  SELECT a.id, a.category, a.severity, a.event_type, a.created_at, a.home_id, h.name AS home_name,
         CASE WHEN d.device_type = 'gateway' THEN d.device_id ELSE gw.device_id END AS gateway_uid,
         CASE WHEN d.device_type = 'gateway' THEN NULL ELSE d.device_id END AS device_uid,
         COALESCE(u.username, u.email) AS actor_username, a.ip_address, a.message, a.details
    FROM audit_log a
    LEFT JOIN smart_homes h ON h.id = a.home_id
    LEFT JOIN devices d ON d.id = a.device_id
    LEFT JOIN devices gw ON gw.id = d.gateway_device_id
    LEFT JOIN users u ON u.id = a.actor_user_id`;

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

export interface LogFilter {
  categories: readonly LogCategory[];
  homeId?: number;
  deviceId?: number;
  severity?: Severity;
  from?: Date;
  to?: Date;
  actor?: string;
  q?: string;
}

function buildWhere(filter: LogFilter): { where: string; params: SqlParam[] } {
  const clauses: string[] = [`a.category IN (${placeholders(filter.categories.length)})`];
  const params: SqlParam[] = [...filter.categories];
  if (filter.homeId !== undefined) {
    clauses.push("a.home_id = ?");
    params.push(filter.homeId);
  }
  if (filter.deviceId !== undefined) {
    clauses.push("a.device_id = ?");
    params.push(filter.deviceId);
  }
  if (filter.severity !== undefined) {
    clauses.push("a.severity = ?");
    params.push(filter.severity);
  }
  if (filter.from !== undefined) {
    clauses.push("a.created_at >= ?");
    params.push(filter.from);
  }
  if (filter.to !== undefined) {
    clauses.push("a.created_at <= ?");
    params.push(filter.to);
  }
  if (filter.actor !== undefined) {
    const pattern = likePattern(filter.actor);
    clauses.push("(u.username LIKE ? OR u.email LIKE ?)");
    params.push(pattern, pattern);
  }
  if (filter.q !== undefined) {
    const pattern = likePattern(filter.q);
    clauses.push("(a.message LIKE ? OR a.event_type LIKE ? OR d.device_id LIKE ?)");
    params.push(pattern, pattern, pattern);
  }
  return { where: `WHERE ${clauses.join(" AND ")}`, params };
}

export async function listLogs(filter: LogFilter, page: number, limit: number): Promise<{ items: LogEntry[]; total: number }> {
  const { where, params } = buildWhere(filter);
  const totalRow = await queryOne<{ total: unknown }>(
    `SELECT COUNT(*) AS total
       FROM audit_log a
       LEFT JOIN devices d ON d.id = a.device_id
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${where}`,
    params
  );
  const rows = await queryRows<LogRow>(`${LOG_SELECT_SQL} ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [
    ...params,
    sqlLimit(limit),
    sqlLimit((page - 1) * limit),
  ]);
  return { items: rows.map(toLogEntry), total: toCount(totalRow?.total) };
}

/** N dòng log mới nhất (stats, gateway detail). */
export async function latestLogs(filter: LogFilter, limit: number): Promise<LogEntry[]> {
  const { where, params } = buildWhere(filter);
  const rows = await queryRows<LogRow>(`${LOG_SELECT_SQL} ${where} ORDER BY a.id DESC LIMIT ?`, [...params, sqlLimit(limit)]);
  return rows.map(toLogEntry);
}

/** Đếm log theo category + severity từ mốc `since` (alerts_to_handle, open_alerts). */
export async function countLogs(categories: readonly LogCategory[], severities: readonly Severity[], since: Date): Promise<number> {
  const row = await queryOne<{ total: unknown }>(
    `SELECT COUNT(*) AS total FROM audit_log
      WHERE category IN (${placeholders(categories.length)}) AND severity IN (${placeholders(severities.length)}) AND created_at >= ?`,
    [...categories, ...severities, since]
  );
  return toCount(row?.total);
}

/** Xoá theo id trong đúng category; không bao giờ xoá dòng LOGS_DELETED (bằng chứng của chính việc xoá). */
export async function deleteLogsByIds(category: LogCategory, ids: readonly number[]): Promise<number> {
  const result = await runSql(
    `DELETE FROM audit_log WHERE category = ? AND event_type <> 'LOGS_DELETED' AND id IN (${placeholders(ids.length)})`,
    [category, ...ids],
    pool
  );
  return result.affectedRows;
}
