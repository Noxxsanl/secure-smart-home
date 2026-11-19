// Facade của module ai-usage: hàm module khác gọi khi AI Agent chạy NGAY TRONG backend (đề xuất gốc
// backend/src/modules/agent/) — ghi trực tiếp, không cần đi qua kênh /api/service.
import type { UsageRecordInput } from "./domain/usage.types";
import { ingestUsage } from "./domain/usage-ingest";

/** Ghi số liệu các lần gọi LLM/STT (đã kiểm tra bằng parseUsageRecord hoặc do code backend tạo). Không ném lỗi. */
export async function recordAiUsage(records: readonly UsageRecordInput[]): Promise<void> {
  try {
    await ingestUsage(records);
  } catch (err) {
    // Không để lỗi ghi số liệu làm hỏng luồng chính; không in record (có thể chứa id người dùng/nhà)
    console.error("[ai-usage] cannot record usage:", err instanceof Error ? err.name : "unknown error");
  }
}

export { parseUsageRecord } from "./domain/usage-record";
