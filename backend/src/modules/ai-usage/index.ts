// Cửa ra DUY NHẤT của module ai-usage: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
export { aiUsageModule } from "./ai-usage.module";
export { parseUsageRecord, recordAiUsage } from "./ai-usage.facade";
export type { UsagePurpose, UsageRecordInput, UsageSource, UsageStatus } from "./domain/usage.types";
