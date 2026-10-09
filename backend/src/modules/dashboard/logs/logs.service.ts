// Log Center (FR-10.1, 10.3, 10.4): phân quyền category theo role + xoá hàng loạt (ADMIN).
import type { RequestMeta } from "../../../lib/clientIp";
import { forbidden, notFound } from "../../../lib/http";
import type { AuthContext } from "../../auth/auth.types";
import { isLogCategory, type LogCategory } from "../../logs/eventCatalog";
import { logEvent } from "../../logs/logEvent";
import { requireAdmin } from "../common/staff";
import type { LogEntry } from "../dashboard.types";
import { deleteLogsByIds, listLogs, type LogFilter } from "./logs.repository";

/** 5 category Operator được đọc (CONTRACT §5 Logs). */
export const OPERATOR_LOG_CATEGORIES: readonly LogCategory[] = ["gateway", "device", "provision", "automation", "ota"];

/** Category lạ → 404 NOT_FOUND. */
export function parseCategory(raw: unknown): LogCategory {
  if (typeof raw !== "string" || !isLogCategory(raw)) throw notFound("Unknown log category");
  return raw;
}

export async function getLogs(
  auth: AuthContext,
  category: LogCategory,
  filter: Omit<LogFilter, "categories">,
  page: number,
  limit: number
): Promise<{ items: LogEntry[]; total: number; page: number; limit: number }> {
  if (auth.role === "operator" && !OPERATOR_LOG_CATEGORIES.includes(category)) {
    throw forbidden("Operators may only read gateway, device, provision, automation and ota logs");
  }
  const result = await listLogs({ ...filter, categories: [category] }, page, limit);
  return { ...result, page, limit };
}

export async function deleteLogs(auth: AuthContext, category: LogCategory, ids: number[], meta: RequestMeta): Promise<void> {
  requireAdmin(auth);
  const deleted = await deleteLogsByIds(category, ids);
  // Ghi SAU khi xoá: dòng LOGS_DELETED mới sinh ra không nằm trong tập bị xoá
  await logEvent({
    eventType: "LOGS_DELETED",
    actorUserId: auth.userId,
    message: `Quản trị viên ${auth.username} đã xoá ${deleted} dòng nhật ký nhóm "${category}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { category, count: deleted },
  });
}
