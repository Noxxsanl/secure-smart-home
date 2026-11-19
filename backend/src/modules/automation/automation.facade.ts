// Hàm + kiểu module khác được gọi (module homes: listAutomationForHome; module recommendations: tạo rule từ gợi ý
// đã chấp nhận, đọc rule, kiểm relay, giờ của rule lịch). Chỉ re-export — không thêm logic ở đây.
export { listAutomationForHome } from "./features/list-console-automations/list-console-automations.handler";
export { toRuleDto } from "./domain/customer-rule.mapper";
export type { AutomationRule } from "./domain/automation.types";
export type { AutomationRuleDto } from "./domain/console-automation.types";
export { findRelayOfHome, getRule } from "./infrastructure/automation-rule.read-model";
export { insertRule, listEnabledScheduleTimes } from "./infrastructure/automation-rule.repository";
