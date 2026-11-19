// Tạo hẹn giờ một lần (hợp đồng §2.1). Thứ tự kiểm (bất biến 6 — không lộ thiết bị/nhà của người khác):
//   requireDeviceAccess(control_device) → 404/403 · thiết bị không thuộc :homeId → 404 · nhà suspended → 409 ·
//   không phải relay/loại hợp lệ hoặc thao tác không hợp loại → 400 NOT_CONTROLLABLE · giờ ngoài khoảng → 400 ·
//   đủ 50 lịch scheduled → 409 SCHEDULE_LIMIT. KHÔNG kiểm online ở đây — runner kiểm lúc chạy.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { HttpError, notFound } from "../../../../shared/errors/http-error";
import { homeLocalParts } from "../../../../shared/time";
import type { CustomerChannel } from "../../../../shared/types/domain";
import { logEvent } from "../../../audit";
import { assertHomeWritable } from "../../../homes";
import { requireDeviceAccess } from "../../../devices";
import {
  MAX_SCHEDULED_PER_HOME,
  actionLabel,
  isActionAllowed,
  isSchedulableDevice,
  toCommandAction,
  toScheduleDto,
} from "../../domain/schedule-policy";
import type { Schedule, ScheduleInput } from "../../domain/schedule.types";
import { resolveWhen } from "../../domain/when";
import { getScheduleRow } from "../../infrastructure/schedule.read-model";
import { insertScheduleIfUnderLimit } from "../../infrastructure/schedule.repository";

export async function createSchedule(
  auth: AuthContext,
  homeId: number,
  input: ScheduleInput,
  channel: CustomerChannel,
  meta: RequestMeta
): Promise<Schedule> {
  const { device, access } = await requireDeviceAccess(auth, input.deviceId, "control_device");
  if (device.home_id !== homeId) throw notFound("Device not found");
  assertHomeWritable(access.home);

  if (!isSchedulableDevice(device) || device.appliance === null) {
    throw new HttpError(400, "NOT_CONTROLLABLE", "Only lamp, fan, curtain and air conditioner relays can be scheduled");
  }
  if (!isActionAllowed(device.appliance, input.action)) {
    throw new HttpError(400, "NOT_CONTROLLABLE", "This action is not supported by the device type");
  }

  const runAt = resolveWhen(input.when, access.home.timezone, new Date());
  const command = toCommandAction(input);
  const id = await insertScheduleIfUnderLimit(
    { homeId, deviceId: device.id, action: command, runAt, origin: "user", channel, createdByUserId: auth.userId },
    MAX_SCHEDULED_PER_HOME
  );
  if (id === null) throw new HttpError(409, "SCHEDULE_LIMIT", `A home can have at most ${MAX_SCHEDULED_PER_HOME} pending schedules`);

  const label = actionLabel(command, device.appliance, device.device_name);
  await logEvent({
    eventType: "SCHEDULE_CREATED",
    homeId,
    deviceId: device.id,
    actorUserId: auth.userId,
    message: `${auth.displayName} hẹn giờ: ${label} lúc ${homeLocalParts(runAt, access.home.timezone).hhmm}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { schedule_id: id, action: command, run_at: runAt.toISOString() },
  });

  const row = await getScheduleRow(id);
  if (!row) throw notFound("Schedule not found");
  return toScheduleDto(row, auth.userId, access.role === "OWNER");
}
