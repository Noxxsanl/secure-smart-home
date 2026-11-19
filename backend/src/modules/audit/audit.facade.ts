// Hàm của module audit mà module khác được gọi (qua index.ts). Chỉ re-export — cài đặt nằm ở domain/ và infrastructure/.
export { resolveEventMeta } from "./domain/event-catalog";
export { OPERATOR_LOG_CATEGORIES } from "./domain/log-categories";
export { TIMELINE_CATEGORIES, timelineLabel } from "./domain/timeline";
export { log, logDataRecvWithPrune } from "./infrastructure/legacy-audit-logger";
export { logEvent } from "./infrastructure/log-event";
export { latestLogs } from "./infrastructure/logs.read-model";
export { countLogs } from "./infrastructure/logs.repository";
