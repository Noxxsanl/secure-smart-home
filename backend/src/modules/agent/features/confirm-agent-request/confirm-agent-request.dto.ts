// Parse body POST /agent/requests/:requestId/confirm (hợp đồng §2.5): { request_hash: 64 hex, step_indexes: [0, …] }.
// Chỉ kiểm CÚ PHÁP (1..10 chỉ số nguyên không trùng); "thuộc các bước đang chờ" kiểm ở handler.
import { HttpError } from "../../../../shared/errors/http-error";
import { requireString } from "../../../../shared/validation/validate";
import { MAX_AGENT_STEPS as MAX_STEPS } from "../../domain/agent.types";

export interface ConfirmAgentRequestInput {
  requestHash: string;
  stepIndexes: number[];
}

export function parseConfirmBody(body: Record<string, unknown>): ConfirmAgentRequestInput {
  const requestHash = requireString(body.request_hash, "request_hash", { min: 64, max: 64, pattern: /^[0-9a-fA-F]{64}$/ });
  if (body.step_indexes === undefined || body.step_indexes === null) throw new HttpError(400, "MISSING_FIELDS", "step_indexes is required");
  const raw = body.step_indexes;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_STEPS) {
    throw new HttpError(400, "INVALID_INPUT", `step_indexes must contain between 1 and ${MAX_STEPS} items`);
  }
  const stepIndexes: number[] = [];
  for (const item of raw) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item >= MAX_STEPS || stepIndexes.includes(item)) {
      throw new HttpError(400, "INVALID_INPUT", "step_indexes must be distinct integers of pending steps");
    }
    stepIndexes.push(item);
  }
  return { requestHash, stepIndexes };
}
