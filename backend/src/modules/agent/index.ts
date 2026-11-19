// Cửa ra DUY NHẤT của module agent: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
export { agentModule } from "./agent.module";
export { computeRequestHash, isExplicitStep, normalizeEvidenceText } from "./agent.facade";
export type { PendingStep } from "./agent.facade";
