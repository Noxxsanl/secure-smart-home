// Cửa ra DUY NHẤT của module schedules: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
export { schedulesModule } from "./schedules.module";
export { MAX_AFTER_MINUTES, MAX_LEAD_MS, MAX_SCHEDULED_PER_HOME, MIN_LEAD_MS, actionLabel, parseWhen, resolveWhen } from "./schedules.facade";
export type { Schedule, ScheduleAction, ScheduleWhen } from "./schedules.facade";
