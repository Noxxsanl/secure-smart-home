// Cửa ra DUY NHẤT của module audit: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
// Danh sách tường minh — thêm export mới ở audit.facade.ts rồi liệt kê ở đây.
export { auditModule } from "./audit.module";
export {
  OPERATOR_LOG_CATEGORIES,
  TIMELINE_CATEGORIES,
  countLogs,
  latestLogs,
  log,
  logDataRecvWithPrune,
  logEvent,
  resolveEventMeta,
  timelineLabel,
} from "./audit.facade";
export type { LogCategory } from "./domain/event-catalog";
export type { LogEntry, LogFilter } from "./domain/log-entry.types";
export type { LogEventInput } from "./infrastructure/log-event";
