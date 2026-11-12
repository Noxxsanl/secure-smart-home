// POST /api/service/ai-usage — AI Agent gửi số liệu các lần gọi LLM/STT (kênh dịch vụ, Bearer SERVICE_API_TOKEN).
// Body: một bản ghi, hoặc { records: [...] } tối đa 20 bản ghi. Không nhận nội dung prompt/câu trả lời.
import type { Request, Response } from "express";
import { HttpError } from "../../../../shared/errors/http-error";
import { parseUsageRecord } from "../../domain/usage-record";
import { ingestUsage } from "../../domain/usage-ingest";

const MAX_BATCH = 20;

export async function ingestUsageController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const raw: unknown[] = Array.isArray(body.records) ? body.records : [body];
  if (raw.length === 0) throw new HttpError(400, "MISSING_FIELDS", "records must not be empty");
  if (raw.length > MAX_BATCH) throw new HttpError(400, "INVALID_INPUT", `records must have at most ${MAX_BATCH} items`);
  const records = raw.map((item, index) => parseUsageRecord(item, Array.isArray(body.records) ? `records[${index}]` : "record"));
  res.status(201).json(await ingestUsage(records));
}
