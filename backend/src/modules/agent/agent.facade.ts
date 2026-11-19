// Hàm module khác (hoặc test thủ công) được gọi. Hiện chỉ có phần thuần của luật Trợ lý: chuẩn hoá chữ cho evidence
// (hợp đồng §2.8 — phải giống hệt `agent/` Python) và hash của các bước chờ xác nhận. Chỉ re-export — không thêm logic ở đây.
export { normalizeEvidenceText } from "./domain/text-normalize";
export { isExplicitStep } from "./domain/explicit-step";
export { computeRequestHash } from "./domain/request-hash";
export type { PendingStep } from "./domain/agent.types";
