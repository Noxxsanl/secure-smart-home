// Parse body POST /api/service/agent/homes/:homeId/requests (hợp đồng §2.3). Chỉ kiểm CÚ PHÁP: utterance 1..500,
// summary 1..200, steps 1..10, reason ≤ 255, evidence_span ≤ 200, action/temperature/position như hẹn giờ giai đoạn 1,
// `when` đúng MỘT dạng {at, day_offset?} | {after_minutes} | {now: true}. Sai cấu trúc → 400 INVALID_INPUT. Quyền, loại
// thiết bị và khoảng thời gian kiểm ở step-rules.ts (từng bước bị từ chối, không làm hỏng cả request).
import { HttpError } from "../../../../shared/errors/http-error";
import { isBlank, optionalString, requireEnum, requireId, requireInt, requireString } from "../../../../shared/validation/validate";
import { AC_SETPOINT_MAX, AC_SETPOINT_MIN } from "../../../devices";
import { parseWhen } from "../../../schedules";
import { AGENT_INPUT_KINDS, MAX_AGENT_STEPS, type AgentStepInput, type AgentStepWhen, type CreateAgentRequestInput } from "../../domain/agent.types";

export const MAX_UTTERANCE_LENGTH = 500;
export const MAX_SUMMARY_LENGTH = 200;
const MAX_STEPS = MAX_AGENT_STEPS;
const MAX_REASON_LENGTH = 255;
const MAX_EVIDENCE_LENGTH = 200;
/** set_pos của giao diện chỉ có 3 mức: đóng / mở nửa / mở hết (như create-schedule.dto). */
const POSITIONS: readonly number[] = [0, 50, 100];
const STEP_ACTIONS = ["turn_on", "turn_off", "set_temp", "set_pos"] as const;

function invalid(why: string): HttpError {
  return new HttpError(400, "INVALID_INPUT", why);
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function parseStepWhen(value: unknown): AgentStepWhen {
  if (value === undefined || value === null) throw new HttpError(400, "MISSING_FIELDS", "steps[].when is required");
  const when = asObject(value, "steps[].when");
  if (when.now === true) {
    if (!isBlank(when.at) || !isBlank(when.after_minutes) || !isBlank(when.day_offset)) {
      throw invalid("when must contain exactly one of now, at, after_minutes");
    }
    return { kind: "now" };
  }
  if (!isBlank(when.now) && when.now !== false) throw invalid("when.now must be true");
  return { kind: "scheduled", when: parseWhen(when) };
}

function parseStep(value: unknown): AgentStepInput {
  const step = asObject(value, "steps[]");
  const action = requireEnum(step.action, "steps[].action", STEP_ACTIONS);
  let temperature: number | null = null;
  let position: number | null = null;
  if (action === "set_temp") {
    temperature = requireInt(step.temperature, "steps[].temperature", { min: AC_SETPOINT_MIN, max: AC_SETPOINT_MAX });
  } else if (action === "set_pos") {
    position = requireInt(step.position, "steps[].position");
    if (!POSITIONS.includes(position)) throw invalid("steps[].position must be one of 0, 50, 100");
  }
  return {
    deviceId: requireId(step.device_id, "steps[].device_id"),
    action,
    temperature,
    position,
    when: parseStepWhen(step.when),
    // reason/evidence_span có thể rỗng: bước không có evidence chỉ không "nói rõ" → luôn chờ xác nhận
    reason: optionalString(step.reason, "steps[].reason", { min: 0, max: MAX_REASON_LENGTH }) ?? "",
    evidenceSpan: optionalString(step.evidence_span, "steps[].evidence_span", { min: 0, max: MAX_EVIDENCE_LENGTH }) ?? "",
  };
}

export function parseCreateAgentRequestBody(body: Record<string, unknown>): CreateAgentRequestInput {
  const inputKind = requireEnum(body.input_kind, "input_kind", AGENT_INPUT_KINDS);
  const utterance = requireString(body.utterance, "utterance", { min: 1, max: MAX_UTTERANCE_LENGTH });
  const summary = requireString(body.summary, "summary", { min: 1, max: MAX_SUMMARY_LENGTH });
  if (body.steps === undefined || body.steps === null) throw new HttpError(400, "MISSING_FIELDS", "steps is required");
  if (!Array.isArray(body.steps)) throw invalid("steps must be an array");
  if (body.steps.length < 1 || body.steps.length > MAX_STEPS) throw invalid(`steps must contain between 1 and ${MAX_STEPS} items`);
  return { inputKind, utterance, summary, steps: body.steps.map(parseStep) };
}
