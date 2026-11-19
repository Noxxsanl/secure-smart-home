import type { Schedule, ScheduleStatus } from "@shh/api-client/portal";

// Hiển thị lịch hẹn mà Trợ lý tạo/chạy: giờ theo múi giờ của nhà (không theo trình duyệt), nhãn trạng thái, lý do lỗi.
// Cùng quy ước với @shh/automation (model/scheduledAction.ts) — module không import nhau (R4) nên chỉ chép phần nhỏ cần dùng.

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

function zonedParts(ms: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timezone), hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

/** Cộng `days` ngày vào khoá ngày "YYYY-MM-DD" (lịch Gregorian, không phụ thuộc múi giờ). */
function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "20:00 hôm nay" / "20:00 ngày mai" / "20:00 · 16/11" — giờ theo múi giờ của nhà. */
export function formatRunAt(iso: string, timezone: string, nowMs: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const run = zonedParts(ms, timezone);
  const today = zonedParts(nowMs, timezone).dayKey;
  const time = `${pad2(run.hour)}:${pad2(run.minute)}`;
  if (run.dayKey === today) return `${time} hôm nay`;
  if (run.dayKey === addDays(today, 1)) return `${time} ngày mai`;
  const [, m, d] = run.dayKey.split("-");
  return `${time} · ${d}/${m}`;
}

/** "4:32" — đồng hồ đếm ngược tới hạn xác nhận; hết hạn trả null. */
export function countdownClock(expiresAtIso: string, nowMs: number): string | null {
  const diff = Date.parse(expiresAtIso) - nowMs;
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const total = Math.ceil(diff / 1000);
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

export function isExpired(expiresAtIso: string, nowMs: number): boolean {
  const at = Date.parse(expiresAtIso);
  return Number.isFinite(at) && at <= nowMs;
}

// Lý do tiếng Việt cho `error_code` của lịch đã kết thúc không như mong đợi.
const REASONS: Record<string, string> = {
  DEVICE_OFFLINE: "thiết bị đang ngoại tuyến",
  TIMEOUT: "thiết bị không phản hồi",
  COMMAND_FAILED: "thiết bị báo lỗi",
  DEVICE_BLOCKED: "thiết bị đang bị chặn",
  HOME_SUSPENDED: "nhà đang tạm ngưng",
  NOT_CONTROLLABLE: "thiết bị không điều khiển được theo cách này",
  NO_DEVICE: "thiết bị đã bị xoá",
  ACCESS_REVOKED: "bạn không còn quyền điều khiển thiết bị này",
  FORBIDDEN: "vai trò của bạn không cho phép điều khiển thiết bị này",
  NOT_FOUND: "không tìm thấy thiết bị",
  ALREADY_IN_STATE: "thiết bị đã ở trạng thái mong muốn nên không cần gửi lệnh",
  INTERRUPTED: "hệ thống bị gián đoạn lúc đang chạy",
  UNKNOWN: "lỗi không xác định",
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Lý do (câu hoàn chỉnh) khi lịch không chạy như mong đợi; null nếu không có gì cần giải thích. */
export function resultReason(schedule: Pick<Schedule, "status" | "error_code">): string | null {
  if (schedule.status === "missed") return "Hệ thống tạm dừng đúng giờ chạy nên lịch không chạy bù.";
  if (schedule.status !== "failed" && schedule.status !== "skipped" && schedule.status !== "cancelled") return null;
  if (!schedule.error_code) return null;
  return `${capitalize(REASONS[schedule.error_code] ?? REASONS.UNKNOWN)}.`;
}

/** Nhãn kết quả của từng bước sau khi xác nhận. */
export function resultLabel(schedule: Schedule, timezone: string, nowMs: number): string {
  const labels: Record<ScheduleStatus, string> = {
    done: "Đã thực hiện",
    scheduled: `Đã hẹn ${formatRunAt(schedule.run_at, timezone, nowMs)}`,
    running: "Đang thực hiện",
    skipped: "Không cần thực hiện",
    failed: "Không thực hiện được",
    cancelled: "Đã huỷ",
    missed: "Bị bỏ lỡ",
  };
  return labels[schedule.status];
}

/** Trạng thái tốt (xanh) / xấu (đỏ) / trung tính, để tô màu dòng kết quả. */
export function resultTone(status: ScheduleStatus): "ok" | "bad" | "neutral" {
  if (status === "done" || status === "scheduled" || status === "running") return "ok";
  if (status === "failed" || status === "missed") return "bad";
  return "neutral";
}
