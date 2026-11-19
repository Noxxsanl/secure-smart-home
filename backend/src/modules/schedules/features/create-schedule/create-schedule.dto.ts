// Parse body POST /homes/:homeId/schedules (hợp đồng §2.1). Chỉ kiểm CÚ PHÁP từng trường; quyền, loại thiết bị và
// khoảng thời gian (cần múi giờ nhà) kiểm ở create-schedule.handler.ts.
import { HttpError } from "../../../../shared/errors/http-error";
import { requireEnum, requireId, requireInt } from "../../../../shared/validation/validate";
import { AC_SETPOINT_MAX, AC_SETPOINT_MIN } from "../../../devices";
import { parseWhen } from "../../domain/when";
import { SCHEDULE_ACTIONS, type ScheduleInput } from "../../domain/schedule.types";

/** set_pos của giao diện chỉ có 3 mức: đóng / mở nửa / mở hết. */
const SCHEDULE_POSITIONS: readonly number[] = [0, 50, 100];

export function parseScheduleBody(body: Record<string, unknown>): ScheduleInput {
  const deviceId = requireId(body.device_id, "device_id");
  const action = requireEnum(body.action, "action", SCHEDULE_ACTIONS);
  let temperature: number | null = null;
  let position: number | null = null;
  if (action === "set_temp") {
    temperature = requireInt(body.temperature, "temperature", { min: AC_SETPOINT_MIN, max: AC_SETPOINT_MAX });
  } else if (action === "set_pos") {
    position = requireInt(body.position, "position");
    if (!SCHEDULE_POSITIONS.includes(position)) throw new HttpError(400, "INVALID_INPUT", "position must be one of 0, 50, 100");
  }
  return { deviceId, action, temperature, position, when: parseWhen(body.when) };
}
