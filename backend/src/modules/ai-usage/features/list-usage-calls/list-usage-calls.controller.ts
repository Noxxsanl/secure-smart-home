// GET /api/dashboard/ai-usage/calls?limit=&status=success|error|timeout|failed&model=&purpose= (Admin + Operator).
// Chỉ số liệu kỹ thuật của từng lượt gọi — không có nội dung hội thoại.
import type { Request, Response } from "express";
import { optionalEnum, parseLimit, queryString } from "../../../../shared/validation/validate";
import { USAGE_PURPOSES, USAGE_STATUSES } from "../../domain/usage.types";
import { listRecentCalls } from "../../infrastructure/usage.read-model";

const STATUS_FILTERS = [...USAGE_STATUSES, "failed"] as const;

export async function listUsageCallsController(req: Request, res: Response): Promise<void> {
  res.json(
    await listRecentCalls(
      {
        status: optionalEnum(queryString(req.query.status), "status", STATUS_FILTERS),
        model: queryString(req.query.model, 128),
        purpose: optionalEnum(queryString(req.query.purpose), "purpose", USAGE_PURPOSES),
      },
      parseLimit(req.query.limit, 50, 200)
    )
  );
}
