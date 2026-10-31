// Truy vấn chỉ-đọc của Log Center: audit_log JOIN smart_homes/devices/users để LogEntry có tên nhà, uid thiết bị,
// người thực hiện. Mọi truy vấn log của Dashboard đi qua đây để LogEntry luôn cùng hình dạng.
import {
  placeholders,
  queryOne,
  queryRows,
  sqlLimit,
  toCount,
  type SqlParam,
} from "../../../infrastructure/database/db";
import { likePattern } from "../../../infrastructure/database/like-pattern";
import { toLogEntry, type LogRow } from "../domain/log-entry.mapper";
import type { LogEntry, LogFilter } from "../domain/log-entry.types";

// Alias: a = audit_log, h = nhà, d = thiết bị, gw = gateway của node, u = người thực hiện (nhân viên hoặc khách).
const LOG_SELECT_SQL = `
  SELECT a.id, a.category, a.severity, a.event_type, a.created_at, a.home_id, h.name AS home_name,
         CASE WHEN d.device_type = 'gateway' THEN d.device_id ELSE gw.device_id END AS gateway_uid,
         CASE WHEN d.device_type = 'gateway' THEN NULL ELSE d.device_id END AS device_uid,
         COALESCE(u.username, u.email) AS actor_username, a.ip_address, a.message, a.details
    FROM audit_log a
    LEFT JOIN smart_homes h ON h.id = a.home_id
    LEFT JOIN devices d ON d.id = a.device_id
    LEFT JOIN devices gw ON gw.id = d.gateway_device_id
    LEFT JOIN users u ON u.id = a.actor_user_id`;

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
    clauses.push("(unaccent(u.username) ILIKE unaccent(?) OR unaccent(u.email) ILIKE unaccent(?))");
    params.push(pattern, pattern);
  }
  if (filter.q !== undefined) {
    const pattern = likePattern(filter.q);
    clauses.push("(unaccent(a.message) ILIKE unaccent(?) OR unaccent(a.event_type) ILIKE unaccent(?) OR unaccent(d.device_id) ILIKE unaccent(?))");
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
