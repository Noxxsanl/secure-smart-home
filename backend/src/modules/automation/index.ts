// Cửa ra DUY NHẤT của module automation: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
export { automationModule } from "./automation.module";
export {
  findRelayOfHome,
  getRule,
  insertRule,
  listAutomationForHome,
  listEnabledScheduleTimes,
  toRuleDto,
} from "./automation.facade";
export type { AutomationRule, AutomationRuleDto } from "./automation.facade";
