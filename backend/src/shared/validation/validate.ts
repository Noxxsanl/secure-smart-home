// Bộ parser input dùng chung cho controller V2. Mỗi hàm nhận `unknown` (req.body,
// req.query, req.params) và trả về giá trị đã kiểm kiểu, hoặc ném HttpError:
//   - thiếu trường bắt buộc  → 400 MISSING_FIELDS
//   - sai kiểu/độ dài/enum   → 400 INVALID_INPUT
//   - id trên path không hợp lệ → 404 NOT_FOUND (id rác thì tài nguyên chắc chắn không tồn tại)
// `detail` luôn là tiếng Anh cho dev và không bao giờ chứa giá trị người dùng nhập
// (có thể là mật khẩu gõ nhầm ô).
import { HttpError } from "../errors/http-error";

const MAX_DB_ID = 2147483647; // INT (PostgreSQL không có UNSIGNED; id vượt miền sẽ gây lỗi 22003 nên chặn sớm → 404/400)

function invalid(field: string, why: string): HttpError {
  return new HttpError(400, "INVALID_INPUT", `${field} ${why}`);
}

function missing(field: string): HttpError {
  return new HttpError(400, "MISSING_FIELDS", `${field} is required`);
}

/** undefined, null hoặc chuỗi rỗng/toàn khoảng trắng đều coi là "không gửi". */
export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

// ── Chuỗi ──────────────────────────────────────────────────────────────────

export interface StringRule {
  min?: number;
  max: number;
  pattern?: RegExp;
  /** Mặc định true. Đặt false cho mật khẩu (khoảng trắng là ký tự hợp lệ). */
  trim?: boolean;
}

function checkString(value: unknown, field: string, rule: StringRule): string {
  if (typeof value !== "string") throw invalid(field, "must be a string");
  const text = rule.trim === false ? value : value.trim();
  if (text.length < (rule.min ?? 1)) throw invalid(field, `must be at least ${rule.min ?? 1} characters`);
  if (text.length > rule.max) throw invalid(field, `must be at most ${rule.max} characters`);
  if (rule.pattern && !rule.pattern.test(text)) throw invalid(field, "has an invalid format");
  return text;
}

export function requireString(value: unknown, field: string, rule: StringRule): string {
  if (isBlank(value)) throw missing(field);
  return checkString(value, field, rule);
}

/** Không gửi (undefined/null/"") → undefined. */
export function optionalString(value: unknown, field: string, rule: StringRule): string | undefined {
  if (isBlank(value)) return undefined;
  return checkString(value, field, rule);
}

/**
 * Cho PATCH: undefined → không đổi (undefined); null hoặc "" → xoá giá trị (null);
 * còn lại → chuỗi đã kiểm.
 */
export function nullableString(value: unknown, field: string, rule: StringRule): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  return checkString(value, field, rule);
}

// ── Enum ───────────────────────────────────────────────────────────────────

export function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (isBlank(value)) throw missing(field);
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw invalid(field, `must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (isBlank(value)) return undefined;
  return requireEnum(value, field, allowed);
}

// ── Số ─────────────────────────────────────────────────────────────────────

export interface NumberRange {
  min?: number;
  max?: number;
}

// Nhận cả number lẫn chuỗi số (query string luôn là chuỗi)
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value.trim());
  return Number.NaN;
}

function checkRange(num: number, field: string, range: NumberRange): number {
  if (range.min !== undefined && num < range.min) throw invalid(field, `must be ≥ ${range.min}`);
  if (range.max !== undefined && num > range.max) throw invalid(field, `must be ≤ ${range.max}`);
  return num;
}

export function requireInt(value: unknown, field: string, range: NumberRange = {}): number {
  if (isBlank(value)) throw missing(field);
  const num = toNumber(value);
  if (!Number.isSafeInteger(num)) throw invalid(field, "must be an integer");
  return checkRange(num, field, range);
}

export function optionalInt(value: unknown, field: string, range: NumberRange = {}): number | undefined {
  if (isBlank(value)) return undefined;
  return requireInt(value, field, range);
}

/** Số thực hữu hạn (ngưỡng nhiệt độ…). */
export function requireNumber(value: unknown, field: string, range: NumberRange = {}): number {
  if (isBlank(value)) throw missing(field);
  const num = toNumber(value);
  if (!Number.isFinite(num)) throw invalid(field, "must be a number");
  return checkRange(num, field, range);
}

export function optionalNumber(value: unknown, field: string, range: NumberRange = {}): number | undefined {
  if (isBlank(value)) return undefined;
  return requireNumber(value, field, range);
}

// ── Boolean ────────────────────────────────────────────────────────────────

/** Nhận true/false, 1/0, "true"/"false", "1"/"0" (query string `?stable=1`). */
export function requireBool(value: unknown, field: string): boolean {
  if (value === undefined || value === null || value === "") throw missing(field);
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw invalid(field, "must be a boolean");
}

export function optionalBool(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireBool(value, field);
}

// ── ID ─────────────────────────────────────────────────────────────────────

function asId(value: unknown): number | null {
  const num = toNumber(value);
  return Number.isSafeInteger(num) && num > 0 && num <= MAX_DB_ID ? num : null;
}

/** id trên path (`req.params.homeId`): không hợp lệ → 404 NOT_FOUND. */
export function parseIdParam(value: unknown): number {
  const id = asId(value);
  if (id === null) throw new HttpError(404, "NOT_FOUND");
  return id;
}

/** id trong body/query: thiếu → 400 MISSING_FIELDS, sai → 400 INVALID_INPUT. */
export function requireId(value: unknown, field: string): number {
  if (isBlank(value)) throw missing(field);
  const id = asId(value);
  if (id === null) throw invalid(field, "must be a positive integer id");
  return id;
}

export function optionalId(value: unknown, field: string): number | undefined {
  if (isBlank(value)) return undefined;
  return requireId(value, field);
}

/** Cho PATCH: undefined → không đổi; null → bỏ gán; còn lại → id hợp lệ. */
export function nullableId(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requireId(value, field);
}

/** Mảng id (đã loại trùng, giữ thứ tự). */
export function requireIdList(
  value: unknown,
  field: string,
  opts: { allowEmpty?: boolean; max?: number } = {}
): number[] {
  if (value === undefined || value === null) throw missing(field);
  if (!Array.isArray(value)) throw invalid(field, "must be an array of ids");
  const ids: number[] = [];
  for (const item of value) {
    const id = asId(item);
    if (id === null) throw invalid(field, "must contain only positive integer ids");
    if (!ids.includes(id)) ids.push(id);
  }
  if (!opts.allowEmpty && ids.length === 0) throw invalid(field, "must not be empty");
  if (opts.max !== undefined && ids.length > opts.max) throw invalid(field, `must contain at most ${opts.max} ids`);
  return ids;
}

// ── Email ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email đã trim + chữ thường (cột users.email lưu chữ thường), ≤ 190 ký tự. */
export function requireEmail(value: unknown, field = "email"): string {
  if (isBlank(value)) throw missing(field);
  if (typeof value !== "string") throw invalid(field, "must be a string");
  const email = value.trim().toLowerCase();
  if (email.length > 190 || !EMAIL_RE.test(email)) throw invalid(field, "must be a valid email address");
  return email;
}

// ── Thời gian ──────────────────────────────────────────────────────────────

// ISO-8601: ngày, hoặc ngày + giờ (+ giây, mili giây, múi giờ). Chuỗi ngày trơn hiểu là UTC 00:00.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export function requireIsoDate(value: unknown, field: string): Date {
  if (isBlank(value)) throw missing(field);
  if (typeof value !== "string" || !ISO_DATE_RE.test(value.trim())) throw invalid(field, "must be an ISO-8601 date");
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) throw invalid(field, "must be a valid date");
  return date;
}

export function optionalIsoDate(value: unknown, field: string): Date | undefined {
  if (isBlank(value)) return undefined;
  return requireIsoDate(value, field);
}

/** Cho PATCH: undefined → không đổi; null → xoá; còn lại → Date hợp lệ. */
export function nullableIsoDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requireIsoDate(value, field);
}

// ── Query string ───────────────────────────────────────────────────────────

/** Lấy giá trị chuỗi đầu tiên của tham số query (Express có thể trả mảng nếu lặp key). */
export function queryString(value: unknown, maxLength = 128): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return undefined;
  const text = first.trim();
  return text ? text.slice(0, maxLength) : undefined;
}

/** `?limit=` khoan dung: thiếu/sai → mặc định, ngoài khoảng → kẹp vào [1, max]. */
export function parseLimit(value: unknown, fallback: number, max: number): number {
  const num = Math.trunc(toNumber(queryString(value) ?? ""));
  if (!Number.isFinite(num) || num < 1) return fallback;
  return Math.min(num, max);
}

/** `?page=` khoan dung: thiếu/sai → 1. */
export function parsePage(value: unknown): number {
  const num = Math.trunc(toNumber(queryString(value) ?? ""));
  return Number.isFinite(num) && num >= 1 ? num : 1;
}
