// Log Center (FR-10.1, 10.3): phân quyền category theo role rồi tra cứu.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { forbidden } from "../../../../shared/errors/http-error";
import type { LogCategory } from "../../domain/event-catalog";
import { OPERATOR_LOG_CATEGORIES } from "../../domain/log-categories";
import type { LogEntry, LogFilter } from "../../domain/log-entry.types";
import { listLogs } from "../../infrastructure/logs.read-model";

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
