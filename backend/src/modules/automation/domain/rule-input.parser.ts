// Parse body tạo/sửa rule (CONTRACT §4.2). Chỉ kiểm kiểu/enum từng trường; ràng buộc chéo (phòng thuộc nhà,
// relay của nhà, trigger ↔ trường) nằm ở rule-builder.ts. Dùng chung cho create-automation và update-automation.
import { HttpError } from "../../../shared/errors/http-error";
import { optionalBool, optionalEnum, optionalId, optionalNumber, optionalString } from "../../../shared/validation/validate";
import type { Metric, Operator, RuleCommand, RuleInput, TriggerType } from "./automation.types";

const TRIGGERS: readonly TriggerType[] = ["sensor_threshold", "schedule"];
const METRICS: readonly Metric[] = ["temperature", "humidity"];
const OPERATORS: readonly Operator[] = [">", "<", "="];
const COMMANDS: readonly RuleCommand[] = ["turn_on", "turn_off"];

function parseDays(value: unknown): number[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 7) throw new HttpError(400, "INVALID_INPUT", "schedule_days must be an array of up to 7 integers");
  return value.map((item) => {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 1 || item > 7) {
      throw new HttpError(400, "INVALID_INPUT", "schedule_days must contain integers 1..7");
    }
    return item;
  });
}

export function parseRuleBody(body: Record<string, unknown>): RuleInput {
  return {
    name: optionalString(body.name, "name", { max: 128 }),
    enabled: optionalBool(body.enabled, "enabled"),
    triggerType: optionalEnum(body.trigger_type, "trigger_type", TRIGGERS),
    roomId: optionalId(body.trigger_room_id, "trigger_room_id"),
    metric: optionalEnum(body.trigger_metric, "trigger_metric", METRICS),
    operator: optionalEnum(body.trigger_operator, "trigger_operator", OPERATORS),
    threshold: optionalNumber(body.trigger_threshold, "trigger_threshold", { min: -100, max: 1000 }),
    scheduleTime: optionalString(body.schedule_time, "schedule_time", { max: 5, pattern: /^\d{2}:\d{2}$/ }),
    scheduleDays: parseDays(body.schedule_days),
    actionDeviceId: optionalId(body.action_device_id, "action_device_id"),
    actionCommand: optionalEnum(body.action_command, "action_command", COMMANDS),
  };
}
