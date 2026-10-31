// Trộn input client với rule hiện có rồi kiểm TOÀN BỘ rule trước khi ghi. Dùng chung cho create-automation
// và update-automation (cùng một bộ ràng buộc).
import { toBool, toNumberOrNull } from "../../../infrastructure/database/db";
import { HttpError } from "../../../shared/errors/http-error";
import { parseHhmm } from "../../../shared/time";
import { findRelayOfHome, roomHasSensor } from "../infrastructure/automation-rule.read-model";
import type { RuleInput, RuleWrite } from "./automation.types";
import { METRIC_TO_SQL, SQL_TO_METRIC, type RuleRow } from "./customer-rule.mapper";

function invalid(detail: string): HttpError {
  return new HttpError(400, "INVALID_INPUT", detail);
}

function missing(field: string): HttpError {
  return new HttpError(400, "MISSING_FIELDS", `${field} is required`);
}

export function writeFromRow(row: RuleRow): RuleWrite {
  return {
    name: row.name,
    triggerType: row.trigger_type,
    enabled: toBool(row.is_enabled),
    roomId: row.condition_room_id,
    sensorType: row.condition_sensor_type,
    operator: row.condition_operator,
    threshold: toNumberOrNull(row.condition_threshold_value),
    scheduleTime: row.schedule_time_of_day,
    scheduleDays: row.schedule_days_of_week,
    actionDeviceId: row.action_device_id ?? 0,
    actionCommand: row.action_command,
  };
}

/**
 * Trộn `base` (rule hiện có, null khi tạo) với `input` rồi kiểm TOÀN BỘ rule:
 *   sensor_threshold → phòng thuộc nhà + có cảm biến, metric, toán tử, ngưỡng số;
 *   schedule → HH:MM hợp lệ + ngày ⊂ 1..7 không rỗng; thiết bị hành động phải là relay của nhà.
 * Trường của loại trigger kia bị xoá về NULL để không rò dữ liệu cũ.
 */
export async function buildWrite(homeId: number, base: RuleWrite | null, input: RuleInput): Promise<RuleWrite> {
  const name = input.name ?? base?.name;
  if (name === undefined) throw missing("name");
  const triggerType = input.triggerType ?? base?.triggerType;
  if (triggerType === undefined) throw missing("trigger_type");
  const actionDeviceId = input.actionDeviceId ?? (base && base.actionDeviceId > 0 ? base.actionDeviceId : undefined);
  if (actionDeviceId === undefined) throw missing("action_device_id");
  const actionCommand = input.actionCommand ?? base?.actionCommand;
  if (actionCommand === undefined) throw missing("action_command");

  if ((await findRelayOfHome(homeId, actionDeviceId)) === null) {
    throw invalid("action_device_id must be a relay of this home");
  }

  const write: RuleWrite = {
    name,
    triggerType,
    enabled: input.enabled ?? base?.enabled ?? true,
    roomId: null,
    sensorType: null,
    operator: null,
    threshold: null,
    scheduleTime: null,
    scheduleDays: null,
    actionDeviceId,
    actionCommand,
  };

  if (triggerType === "sensor_threshold") {
    const roomId = input.roomId !== undefined ? input.roomId : (base?.roomId ?? null);
    const metric = input.metric !== undefined ? input.metric : (base?.sensorType ? SQL_TO_METRIC[base.sensorType] : null);
    const operator = input.operator !== undefined ? input.operator : (base?.operator ?? null);
    const threshold = input.threshold !== undefined ? input.threshold : (base?.threshold ?? null);
    if (roomId === null) throw missing("trigger_room_id");
    if (metric === null) throw missing("trigger_metric");
    if (operator === null) throw missing("trigger_operator");
    if (threshold === null) throw missing("trigger_threshold");
    const hasSensor = await roomHasSensor(homeId, roomId);
    if (hasSensor === null) throw invalid("trigger_room_id must belong to this home");
    if (!hasSensor) throw invalid("trigger_room_id has no climate sensor");
    write.roomId = roomId;
    write.sensorType = METRIC_TO_SQL[metric];
    write.operator = operator;
    write.threshold = threshold;
  } else {
    const time = input.scheduleTime !== undefined ? input.scheduleTime : (base?.scheduleTime ?? null);
    let days: number[] | null;
    if (input.scheduleDays !== undefined) days = input.scheduleDays;
    else days = base?.scheduleDays ? base.scheduleDays.split(",").map(Number) : null;
    if (time === null) throw missing("schedule_time");
    if (days === null) throw missing("schedule_days");
    if (parseHhmm(time) === null) throw invalid("schedule_time must be HH:MM (00:00-23:59)");
    const unique = [...new Set(days)].sort((a, b) => a - b);
    if (unique.length === 0 || unique.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw invalid("schedule_days must be a non-empty list of integers 1..7");
    }
    write.scheduleTime = time;
    write.scheduleDays = unique.join(",");
  }
  return write;
}
