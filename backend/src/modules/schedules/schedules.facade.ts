// Hàm + kiểu module khác được gọi. Giai đoạn 2 (Trợ lý AI giọng nói/chữ — module agent) dùng lại:
//   resolveWhen/parseWhen (đổi "20:00" / "sau 30 phút" / day_offset thành run_at theo múi giờ nhà đúng như API hẹn giờ),
//   isActionAllowed/isSchedulableDevice/toCommandAction/actionLabel (luật thao tác theo loại thiết bị + nhãn tiếng Việt),
//   insertAgentSchedules (tạo lịch origin 'ai_agent' trong transaction của người gọi, trần 50 lịch),
//   executeScheduleNow/executeSchedulesNow (chạy ngay một lịch / một lô — cùng hàm với worker), getSchedulesByIds/listSchedulesByAgentRequest (DTO).
// Chỉ re-export — không thêm logic ở đây.
export { MAX_AFTER_MINUTES, MAX_DAY_OFFSET, MAX_LEAD_MS, MIN_LEAD_MS, parseWhen, resolveWhen } from "./domain/when";
export {
  MAX_SCHEDULED_PER_HOME,
  SCHEDULABLE_APPLIANCES,
  actionLabel,
  isActionAllowed,
  isSchedulableDevice,
  lowerFirst,
  normalizeErrorCode,
  toCommandAction,
} from "./domain/schedule-policy";
export { executeScheduleNow, executeSchedulesNow } from "./domain/execute-schedule";
export { getSchedulesByIds, listSchedulesByAgentRequest } from "./domain/schedule-query";
export { insertAgentSchedules } from "./infrastructure/schedule.repository";
export type { AgentScheduleContext, NewAgentSchedule } from "./infrastructure/schedule.repository";
export type { ExecuteScheduleOptions } from "./domain/execute-schedule";
export type { Schedule, ScheduleAction, ScheduleWhen } from "./domain/schedule.types";
