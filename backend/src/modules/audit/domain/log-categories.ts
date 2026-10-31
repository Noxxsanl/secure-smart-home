// Quy tắc category của Log Center (FR-10.1): ADMIN đọc mọi category, Operator chỉ đọc nhóm vận hành.
import { notFound } from "../../../shared/errors/http-error";
import { isLogCategory, type LogCategory } from "./event-catalog";

/** 5 category Operator được đọc (CONTRACT §5 Logs). */
export const OPERATOR_LOG_CATEGORIES: readonly LogCategory[] = ["gateway", "device", "provision", "automation", "ota"];

/** Category lạ → 404 NOT_FOUND. */
export function parseCategory(raw: unknown): LogCategory {
  if (typeof raw !== "string" || !isLogCategory(raw)) throw notFound("Unknown log category");
  return raw;
}
