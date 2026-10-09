// Giờ địa phương của từng nhà (smart_homes.timezone) cho lịch automation, phân tích
// thói quen và user_behavior_logs. Dùng Intl.DateTimeFormat để không phụ thuộc
// múi giờ của server/MySQL (server chạy UTC, nhà ở Asia/Ho_Chi_Minh).

export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

/**
 * Cửa sổ "online" của thiết bị: last_seen trong vòng 90 giây (NFR-R1, CONTRACT_V2 §0).
 * Hằng số DUY NHẤT cho code mới — không viết lại số 60/90 ở chỗ khác.
 */
export const ONLINE_WINDOW_SECONDS = 90;

/** Thiết bị coi là online nếu thấy lần cuối trong ONLINE_WINDOW_SECONDS (last_seen null → offline). */
export function isOnline(lastSeen: Date | string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!lastSeen) return false;
  const seenMs = (lastSeen instanceof Date ? lastSeen : new Date(lastSeen)).getTime();
  if (Number.isNaN(seenMs)) return false;
  return (nowMs - seenMs) / 1000 < ONLINE_WINDOW_SECONDS;
}

export interface HomeLocalParts {
  /** 0 = Chủ nhật … 6 = Thứ bảy (cột user_behavior_logs.weekday). */
  weekday: number;
  /** 1 = Thứ hai … 7 = Chủ nhật (automation_rules.schedule_days_of_week). */
  isoWeekday: number;
  /** Phút trong ngày 0–1439. */
  minuteOfDay: number;
  /** "HH:MM" 24 giờ. */
  hhmm: string;
  /** "YYYY-MM-DD" theo giờ địa phương — khoá đếm "ngày khác nhau". */
  dateKey: string;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23", // tránh "24:05" của hour12:false trên một số engine
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Tách `date` thành các phần theo múi giờ `timeZone` (sai tên múi giờ → DEFAULT_TIMEZONE). */
export function homeLocalParts(date: Date, timeZone: string): HomeLocalParts {
  const formatter = isValidTimeZone(timeZone) ? formatterFor(timeZone) : formatterFor(DEFAULT_TIMEZONE);
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;

  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const weekday = WEEKDAY_INDEX[parts.weekday] ?? 0;
  return {
    weekday,
    isoWeekday: weekday === 0 ? 7 : weekday,
    minuteOfDay: hour * 60 + minute,
    hhmm: formatHhmm(hour * 60 + minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** "HH:MM" → phút trong ngày; sai định dạng → null. */
export function parseHhmm(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Phút trong ngày → "HH:MM" (tự quay vòng qua nửa đêm). */
export function formatHhmm(minuteOfDay: number): string {
  const normalized = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
