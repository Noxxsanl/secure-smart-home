// Hàm + kiểu module khác được gọi. Giai đoạn 2 (AI Agent giọng nói) dùng lại resolveWhen/parseWhen để đổi
// "20:00" / "sau 30 phút" thành run_at theo múi giờ nhà đúng như API hẹn giờ. Chỉ re-export — không thêm logic ở đây.
export { MAX_AFTER_MINUTES, MAX_LEAD_MS, MIN_LEAD_MS, parseWhen, resolveWhen } from "./domain/when";
export { MAX_SCHEDULED_PER_HOME, actionLabel } from "./domain/schedule-policy";
export type { Schedule, ScheduleAction, ScheduleWhen } from "./domain/schedule.types";
