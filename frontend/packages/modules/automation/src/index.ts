// @shh/automation — quy tắc tự động hoá và gợi ý thói quen.

export { usePendingSuggestionCount } from "./api/usePendingSuggestionCount";

// Console
export { AutomationPage } from "./features/rule-list";

// Cổng khách
export { HomeAutomationPage } from "./features/home-automation";
// Hẹn giờ một lần: trang /schedules + mục "Hẹn giờ" ở chi tiết thiết bị (ghép qua slot `renderSchedule` của @shh/devices).
export { SchedulesPage } from "./features/home-schedules";
export { DeviceSchedule } from "./features/device-schedule";
export type { DeviceScheduleProps } from "./features/device-schedule";
