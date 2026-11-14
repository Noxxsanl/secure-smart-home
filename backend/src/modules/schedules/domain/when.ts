// Quy đổi "khi nào chạy" của hẹn giờ thành thời điểm tuyệt đối (run_at, UTC) theo MÚI GIỜ CỦA NHÀ.
// Hàm THUẦN (không DB, không đọc đồng hồ): `now` truyền vào để test được và để giai đoạn 2 (AI Agent giọng nói)
// dùng lại y hệt qua facade — server chạy UTC, nhà ở Asia/Ho_Chi_Minh nên KHÔNG dùng múi giờ máy chủ.
//
//   { after_minutes: N }          → now + N phút (giữ nguyên giây)
//   { at: "HH:MM", date: "…" }    → đúng giờ địa phương đó của ngày đó, giây = 0
//   { at: "HH:MM" }               → hôm nay (giờ nhà) lúc HH:MM; nếu < now + 30 s thì cộng 1 ngày
// Bắt buộc now + 30 s ≤ run_at ≤ now + 7 ngày, ngoài khoảng → 400 INVALID_INPUT.
import { HttpError } from "../../../shared/errors/http-error";
import { isBlank } from "../../../shared/validation/validate";
import { homeLocalParts, parseHhmm } from "../../../shared/time";
import type { ScheduleWhen } from "./schedule.types";

/** Đủ xa để lệnh không "đã quá giờ" ngay khi vừa ghi (runner quét 5 s/lần). */
export const MIN_LEAD_MS = 30_000;
/** Hẹn tối đa 7 ngày. */
export const MAX_LEAD_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_AFTER_MINUTES = 7 * 24 * 60;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function invalid(why: string): HttpError {
  return new HttpError(400, "INVALID_INPUT", why);
}

/** "YYYY-MM-DD" là ngày CÓ THẬT (loại 2026-02-30). Trả [năm, tháng, ngày] hoặc null. */
function parseDateKey(value: string): [number, number, number] | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return [year, month, day];
}

function addDays(dateKey: string, days: number): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) throw new Error("addDays: invalid date key");
  return new Date(Date.UTC(parsed[0], parsed[1] - 1, parsed[2] + days)).toISOString().slice(0, 10);
}

/** Độ lệch múi giờ (ms, local − UTC) tại thời điểm `instantMs`: giờ địa phương coi như UTC trừ đi thời điểm thật. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const local = homeLocalParts(new Date(instantMs), timeZone);
  const [year, month, day] = local.dateKey.split("-").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day) + local.minuteOfDay * 60_000;
  return localAsUtc - Math.floor(instantMs / 60_000) * 60_000;
}

/** Ngày + giờ-phút theo múi giờ nhà → thời điểm UTC (ms). Lặp 2 lần để đúng cả khi offset đổi giữa ngày (DST). */
function localToUtcMs(dateKey: string, minuteOfDay: number, timeZone: string): number {
  const parsed = parseDateKey(dateKey);
  if (!parsed) throw new Error("localToUtcMs: invalid date key");
  const wall = Date.UTC(parsed[0], parsed[1] - 1, parsed[2]) + minuteOfDay * 60_000;
  let utc = wall - zoneOffsetMs(wall, timeZone);
  utc = wall - zoneOffsetMs(utc, timeZone);
  return utc;
}

/**
 * Kiểm CÚ PHÁP `when` của request (`{ at, date? }` hoặc `{ after_minutes }`, đúng một trong hai). Thiếu → 400
 * MISSING_FIELDS, sai → 400 INVALID_INPUT. Chưa kiểm khoảng thời gian (cần múi giờ nhà) — việc của resolveWhen.
 */
export function parseWhen(value: unknown): ScheduleWhen {
  if (value === undefined || value === null) throw new HttpError(400, "MISSING_FIELDS", "when is required");
  if (typeof value !== "object" || Array.isArray(value)) throw invalid("when must be an object");
  const body = value as Record<string, unknown>;
  const hasAt = !isBlank(body.at);
  const hasAfter = !isBlank(body.after_minutes);
  if (!hasAt && !hasAfter) throw new HttpError(400, "MISSING_FIELDS", "when.at or when.after_minutes is required");
  if (hasAt && hasAfter) throw invalid("when must contain exactly one of at, after_minutes");

  if (hasAfter) {
    if (!isBlank(body.date)) throw invalid("when.date can only be used with when.at");
    const minutes = body.after_minutes;
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > MAX_AFTER_MINUTES) {
      throw invalid(`when.after_minutes must be an integer between 1 and ${MAX_AFTER_MINUTES}`);
    }
    return { afterMinutes: minutes };
  }

  if (typeof body.at !== "string" || parseHhmm(body.at.trim()) === null) throw invalid("when.at must be HH:MM (00:00-23:59)");
  const at = body.at.trim();
  if (isBlank(body.date)) return { at };
  if (typeof body.date !== "string" || parseDateKey(body.date.trim()) === null) throw invalid("when.date must be a real date YYYY-MM-DD");
  return { at, date: body.date.trim() };
}

/** Thời điểm chạy tuyệt đối (UTC) của `when` theo múi giờ nhà; ngoài [now + 30 s, now + 7 ngày] → 400 INVALID_INPUT. */
export function resolveWhen(when: ScheduleWhen, timezone: string, now: Date): Date {
  const nowMs = now.getTime();
  let runMs: number;

  if ("afterMinutes" in when) {
    if (!Number.isInteger(when.afterMinutes) || when.afterMinutes < 1 || when.afterMinutes > MAX_AFTER_MINUTES) {
      throw invalid(`after_minutes must be an integer between 1 and ${MAX_AFTER_MINUTES}`);
    }
    runMs = nowMs + when.afterMinutes * 60_000;
  } else {
    const minuteOfDay = parseHhmm(when.at);
    if (minuteOfDay === null) throw invalid("at must be HH:MM (00:00-23:59)");
    if (when.date !== undefined) {
      if (parseDateKey(when.date) === null) throw invalid("date must be a real date YYYY-MM-DD");
      runMs = localToUtcMs(when.date, minuteOfDay, timezone);
    } else {
      const today = homeLocalParts(now, timezone).dateKey;
      runMs = localToUtcMs(today, minuteOfDay, timezone);
      // Giờ đã qua (hoặc sát quá) → lần tới là ngày mai
      if (runMs < nowMs + MIN_LEAD_MS) runMs = localToUtcMs(addDays(today, 1), minuteOfDay, timezone);
    }
  }

  if (runMs < nowMs + MIN_LEAD_MS || runMs > nowMs + MAX_LEAD_MS) {
    throw invalid("run time must be between 30 seconds and 7 days from now");
  }
  return new Date(runMs);
}
