// Ghi các lần gọi LLM/STT + tính chi phí theo bảng giá hiện tại, trong MỘT transaction. Dùng chung cho kênh
// /api/service (features/ingest-usage) và facade recordAiUsage (Agent chạy trong backend).
import { withTransaction } from "../../../infrastructure/database/db";
import type { UsageRecordInput } from "./usage.types";
import { applyCosts, insertUsageRecords } from "../infrastructure/usage.repository";

export async function ingestUsage(records: readonly UsageRecordInput[]): Promise<{ accepted: number }> {
  const ids = await withTransaction(async (conn) => {
    const inserted = await insertUsageRecords(conn, records);
    await applyCosts(conn, inserted);
    return inserted;
  });
  return { accepted: ids.length };
}
