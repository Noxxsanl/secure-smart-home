// Định dạng giờ theo MÚI GIỜ CỦA NHÀ cho context của agent và thông báo AGENT_SCHEDULED. Hàm thuần (nhận `now`).
import { homeLocalParts } from "../../../shared/time";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Cộng `days` ngày vào khoá ngày "YYYY-MM-DD" (lịch dương, không phụ thuộc múi giờ máy chủ). */
function addDaysToKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** ISO-8601 có offset theo múi giờ nhà, vd "2026-11-14T19:10:05+07:00". */
export function formatLocalIso(date: Date, timezone: string): string {
  const parts = homeLocalParts(date, timezone);
  const [year, month, day] = parts.dateKey.split("-").map(Number);
  const localMs = Date.UTC(year, month - 1, day) + parts.minuteOfDay * 60_000;
  const offsetMin = Math.round((localMs - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  return `${parts.dateKey}T${parts.hhmm}:${pad(date.getUTCSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** "19:40" / "08:00 ngày mai" / "08:00 15/11" — HH:MM giờ nhà, thêm ngày nếu không phải hôm nay. */
export function describeLocalTime(runAt: Date, now: Date, timezone: string): string {
  const run = homeLocalParts(runAt, timezone);
  const today = homeLocalParts(now, timezone).dateKey;
  if (run.dateKey === today) return run.hhmm;
  if (run.dateKey === addDaysToKey(today, 1)) return `${run.hhmm} ngày mai`;
  const [, month, day] = run.dateKey.split("-");
  return `${run.hhmm} ${day}/${month}`;
}
