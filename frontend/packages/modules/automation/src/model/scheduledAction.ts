import type {
  CustomerDevice, DeviceAppliance, Schedule, ScheduleAction, ScheduleInput, ScheduleStatus,
} from "@shh/api-client/portal";

// Hẹn giờ một lần (khác "theo lịch" lặp hằng tuần của quy tắc tự động hoá): kiểu, tuỳ chọn thao tác theo loại thiết bị,
// định dạng giờ theo múi giờ của nhà và câu tiếng Việt cho lỗi / lý do.

export const SCHEDULE_APPLIANCES: readonly DeviceAppliance[] = ["lamp", "fan", "curtain", "ac"];

export const SCHEDULE_TEMP_MIN = 16;
export const SCHEDULE_TEMP_MAX = 30;
export const SCHEDULE_TEMP_DEFAULT = 26;
export const SCHEDULE_AFTER_MIN = 1;
export const SCHEDULE_AFTER_MAX = 10_080; // 7 ngày
export const SCHEDULE_AFTER_PRESETS: readonly number[] = [5, 15, 30, 60];

export type ScheduleChoice = {
  /** Khoá của lựa chọn trong form (duy nhất trong một loại thiết bị). */
  key: string;
  label: string;
  action: ScheduleAction;
  position?: number;
  /** Điều hoà "Đặt nhiệt độ": hiện ô nhập 16–30 °C. */
  needsTemperature?: boolean;
};

export const APPLIANCE_NAMES: Record<DeviceAppliance, string> = {
  lamp: "Đèn", fan: "Quạt", curtain: "Rèm cửa", ac: "Điều hoà",
};

// Thao tác hợp loại thiết bị — trùng bảng kiểm của backend (sai loại → 400 NOT_CONTROLLABLE).
export const SCHEDULE_CHOICES: Record<DeviceAppliance, ScheduleChoice[]> = {
  lamp: [
    { key: "on", label: "Bật", action: "turn_on" },
    { key: "off", label: "Tắt", action: "turn_off" },
  ],
  fan: [
    { key: "on", label: "Bật", action: "turn_on" },
    { key: "off", label: "Tắt", action: "turn_off" },
  ],
  curtain: [
    { key: "pos100", label: "Mở hết", action: "set_pos", position: 100 },
    { key: "pos50", label: "Mở 50%", action: "set_pos", position: 50 },
    { key: "pos0", label: "Đóng", action: "set_pos", position: 0 },
  ],
  ac: [
    { key: "on", label: "Bật", action: "turn_on" },
    { key: "off", label: "Tắt", action: "turn_off" },
    { key: "temp", label: "Đặt nhiệt độ", action: "set_temp", needsTemperature: true },
  ],
};

export type SchedulableDevice = {
  id: number;
  name: string;
  roomName: string | null;
  appliance: DeviceAppliance;
};

/**
 * Thiết bị hẹn giờ được: relay do backend đã gán đồ vật (đèn/quạt/rèm/điều hoà — không đoán theo tên vì backend chỉ
 * nhận `appliance`) và tài khoản được điều khiển. Không cần online: backend kiểm tra lúc chạy, không phải lúc tạo.
 */
export function schedulableDevices(devices: CustomerDevice[]): SchedulableDevice[] {
  const result: SchedulableDevice[] = [];
  for (const d of devices) {
    const appliance = d.appliance;
    if (d.category !== "relay" || !d.can_control || !appliance || !SCHEDULE_APPLIANCES.includes(appliance)) continue;
    result.push({ id: d.id, name: d.device_name, roomName: d.room_name, appliance });
  }
  return result;
}

// ---- Múi giờ của nhà ------------------------------------------------------

/** Múi giờ IANA hợp lệ hoặc undefined (rơi về múi giờ trình duyệt thay vì ném lỗi). */
function safeZone(timezone: string): string | undefined {
  try {
    new Intl.DateTimeFormat("vi-VN", { timeZone: timezone });
    return timezone;
  } catch {
    return undefined;
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");

type ZonedParts = { dayKey: string; hour: number; minute: number; second: number };

function zonedParts(ms: number, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timezone), hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24, minute: Number(get("minute")), second: Number(get("second")),
  };
}

/** Cộng `days` ngày vào khoá ngày "YYYY-MM-DD" (lịch Gregorian, không phụ thuộc múi giờ). */
export function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Khoá ngày hôm nay theo giờ của nhà. */
export function todayKey(timezone: string, nowMs: number): string {
  return zonedParts(nowMs, timezone).dayKey;
}

/** Giờ gợi ý ban đầu của form: bây giờ + 30 phút theo giờ của nhà ("HH:MM"). */
export function defaultTime(timezone: string, nowMs: number): string {
  const p = zonedParts(nowMs + 30 * 60_000, timezone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

function dayLabel(dayKey: string, today: string): string {
  if (dayKey === today) return "hôm nay";
  if (dayKey === addDays(today, 1)) return "ngày mai";
  if (dayKey === addDays(today, -1)) return "hôm qua";
  const [, m, d] = dayKey.split("-");
  return `${d}/${m}`;
}

function composeWhen(time: string, dayKey: string, today: string): string {
  const label = dayLabel(dayKey, today);
  // "20:00 hôm nay" / "20:00 ngày mai" / "20:00 · 16/11" (xa hơn).
  return /^\d{2}\/\d{2}$/.test(label) ? `${time} · ${label}` : `${time} ${label}`;
}

/** "20:00 hôm nay" / "20:00 ngày mai" / "20:00 · 16/11" — giờ theo múi giờ của nhà, không theo trình duyệt. */
export function formatRunAt(iso: string, timezone: string, nowMs: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const run = zonedParts(ms, timezone);
  return composeWhen(`${pad2(run.hour)}:${pad2(run.minute)}`, run.dayKey, todayKey(timezone, nowMs));
}

/** "còn 25 phút" / "còn 2 giờ 10 phút" / "còn 3 ngày"; quá giờ mà chưa chạy → "đang chuẩn bị chạy". */
export function countdownText(iso: string, nowMs: number): string {
  const diffMs = Date.parse(iso) - nowMs;
  if (!Number.isFinite(diffMs)) return "";
  if (diffMs <= 0) return "đang chuẩn bị chạy";
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return minutes <= 1 ? "còn dưới 1 phút" : `còn ${minutes} phút`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `còn ${h} giờ` : `còn ${h} giờ ${m} phút`;
  }
  return `còn ${Math.floor(minutes / (24 * 60))} ngày`;
}

// ---- Form -----------------------------------------------------------------

export type WhenMode = "at" | "after";
export type DateChoice = "next" | "tomorrow" | "pick";

export type WhenDraft = {
  mode: WhenMode;
  /** "HH:MM". */
  time: string;
  dateChoice: DateChoice;
  /** "YYYY-MM-DD" — chỉ dùng khi dateChoice = "pick". */
  pickedDate: string;
  /** Số phút (chuỗi nhập tay hoặc chọn nhanh). */
  afterMinutes: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Số nguyên 1–10080 từ ô nhập; null nếu chưa hợp lệ. */
export function parseAfterMinutes(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return n >= SCHEDULE_AFTER_MIN && n <= SCHEDULE_AFTER_MAX ? n : null;
}

/** Dựng `when` gửi backend; null nếu form chưa đủ / sai. "Lần tới" không gửi `date` (backend tự chọn hôm nay/ngày mai). */
export function buildWhen(draft: WhenDraft, timezone: string, nowMs: number): ScheduleInput["when"] | null {
  if (draft.mode === "after") {
    const minutes = parseAfterMinutes(draft.afterMinutes);
    return minutes === null ? null : { after_minutes: minutes };
  }
  if (!TIME_PATTERN.test(draft.time)) return null;
  if (draft.dateChoice === "next") return { at: draft.time };
  if (draft.dateChoice === "tomorrow") return { at: draft.time, date: addDays(todayKey(timezone, nowMs), 1) };
  return DATE_PATTERN.test(draft.pickedDate) ? { at: draft.time, date: draft.pickedDate } : null;
}

/**
 * Dòng xem trước "Sẽ chạy: …" — mô phỏng cách backend quy đổi (giờ nhà; "lần tới" cộng 1 ngày nếu giờ đó sắp/đã qua,
 * ngưỡng 30 s). Chỉ để người dùng thấy trước; backend vẫn là nơi quyết định `run_at`.
 */
export function previewWhen(when: ScheduleInput["when"] | null, timezone: string, nowMs: number): string | null {
  if (!when) return null;
  if ("after_minutes" in when) {
    return formatRunAt(new Date(nowMs + when.after_minutes * 60_000).toISOString(), timezone, nowMs);
  }
  const now = zonedParts(nowMs, timezone);
  let dayKey = when.date ?? now.dayKey;
  if (!when.date) {
    const [h, m] = when.at.split(":").map(Number);
    if (h * 3600 + m * 60 < now.hour * 3600 + now.minute * 60 + now.second + 30) dayKey = addDays(dayKey, 1);
  }
  return composeWhen(when.at, dayKey, now.dayKey);
}

// ---- Trạng thái, lỗi -------------------------------------------------------

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  scheduled: "Chờ chạy",
  running: "Đang chạy",
  done: "Đã chạy",
  skipped: "Bỏ qua",
  failed: "Không chạy được",
  cancelled: "Đã huỷ",
  missed: "Bị bỏ lỡ",
};

// Màu huy hiệu theo token (có dark:).
export const SCHEDULE_STATUS_CLASSES: Record<ScheduleStatus, string> = {
  scheduled: "bg-brand-soft text-brand",
  running: "bg-brand-soft text-brand",
  done: "bg-success-soft text-success",
  skipped: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300",
  failed: "bg-critical-soft text-critical",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300",
  missed: "bg-warning-soft text-warning",
};

// Lý do tiếng Việt cho `error_code` của lịch đã kết thúc không như mong đợi.
const REASONS: Record<string, string> = {
  DEVICE_OFFLINE: "thiết bị đang ngoại tuyến",
  TIMEOUT: "thiết bị không phản hồi",
  COMMAND_FAILED: "thiết bị báo lỗi",
  DEVICE_BLOCKED: "thiết bị đang bị chặn",
  HOME_SUSPENDED: "nhà đang tạm ngưng",
  NOT_CONTROLLABLE: "thiết bị không còn điều khiển được theo cách này",
  NO_DEVICE: "thiết bị đã bị xoá",
  ACCESS_REVOKED: "người tạo lịch không còn quyền điều khiển thiết bị",
  ALREADY_IN_STATE: "thiết bị đã ở trạng thái mong muốn nên không cần gửi lệnh",
  INTERRUPTED: "hệ thống bị gián đoạn lúc đang chạy",
  UNKNOWN: "lỗi không xác định",
};

/** Câu giải thích cho dòng lịch đã kết thúc ("Thiết bị đang ngoại tuyến"); null nếu không cần giải thích. */
export function scheduleReason(schedule: Pick<Schedule, "status" | "error_code">): string | null {
  const { status, error_code: code } = schedule;
  if (status === "missed") return "Hệ thống tạm dừng đúng giờ chạy nên lịch không chạy bù.";
  if (status !== "failed" && status !== "skipped" && status !== "cancelled") return null;
  if (!code) return null;
  const reason = REASONS[code] ?? REASONS.UNKNOWN;
  return reason.charAt(0).toUpperCase() + reason.slice(1) + ".";
}

// Câu lỗi riêng của hẹn giờ (đè lên bảng chung của portalErrorMessage).
export const SCHEDULE_ERRORS: Record<string, string> = {
  INVALID_INPUT:
    "Hẹn giờ chưa hợp lệ. Hãy chọn thời điểm từ 30 giây tới tối đa 7 ngày sau, và nhiệt độ điều hoà trong khoảng 16–30 °C.",
  MISSING_FIELDS: "Còn thiếu thông tin. Hãy chọn thiết bị, thao tác và thời điểm chạy.",
  NOT_CONTROLLABLE: "Thiết bị này không hẹn giờ được thao tác đã chọn. Hãy chọn thao tác khác hoặc thiết bị khác.",
  FORBIDDEN:
    "Vai trò của bạn không cho phép hẹn giờ thiết bị này. Chủ nhà và người điều khiển hẹn được mọi thiết bị; khách chỉ hẹn được thiết bị được chỉ định.",
  NOT_FOUND: "Không tìm thấy thiết bị hoặc lịch này nữa. Danh sách sẽ được làm mới.",
  HOME_SUSPENDED: "Dịch vụ của nhà này đang tạm ngưng nên chưa tạo được hẹn giờ. Bạn vẫn huỷ được các lịch đang chờ.",
  SCHEDULE_LIMIT: "Nhà đã có 50 hẹn giờ đang chờ. Hãy huỷ bớt hoặc chờ một số lịch chạy xong rồi tạo thêm.",
  SCHEDULE_NOT_CANCELLABLE: "Lịch này đã chạy hoặc đã bị huỷ nên không huỷ được nữa. Danh sách sẽ được làm mới.",
};
