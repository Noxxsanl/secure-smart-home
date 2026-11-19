// Huỷ hẹn giờ trước giờ chạy (hợp đồng §2.3). Cho huỷ cả khi nhà đang suspended (huỷ chỉ giảm việc, không điều khiển).
//   lịch không tồn tại / nhà không thuộc quyền / GUEST không phải người tạo → 404
//   không phải người tạo và không phải OWNER → 403 · status ≠ scheduled → 409 SCHEDULE_NOT_CANCELLABLE
// UPDATE có điều kiện `status = 'scheduled'` chống race với runner: runner đã giành quyền thì 0 dòng → 409.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { HttpError, forbidden, notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { requireHomeMember } from "../../../homes";
import { toScheduleDto } from "../../domain/schedule-policy";
import type { Schedule } from "../../domain/schedule.types";
import { getScheduleRow } from "../../infrastructure/schedule.read-model";
import { cancelScheduled } from "../../infrastructure/schedule.repository";

function notCancellable(): HttpError {
  return new HttpError(409, "SCHEDULE_NOT_CANCELLABLE", "Only a pending schedule can be cancelled");
}

/** Mọi lý do "không thấy lịch" dùng CHUNG một câu trả lời (cả detail) để không lộ lịch/nhà có tồn tại hay không. */
function scheduleNotFound(): HttpError {
  return notFound("Schedule not found");
}

export async function cancelSchedule(auth: AuthContext, scheduleId: number, meta: RequestMeta): Promise<Schedule> {
  const row = await getScheduleRow(scheduleId);
  if (!row) throw scheduleNotFound();
  // Nhà không thuộc quyền: requireHomeMember ném 404 "Home not found" — đổi sang đúng câu của lịch không tồn tại
  // (nếu không, detail khác nhau cho phép dò id lịch của nhà khác)
  const access = await requireHomeMember(auth, row.home_id, "view").catch((err: unknown) => {
    throw err instanceof HttpError && err.status === 404 ? scheduleNotFound() : err;
  });
  const isCreator = row.created_by_user_id === auth.userId;
  if (access.role === "GUEST" && !isCreator) throw scheduleNotFound();
  const isOwner = access.role === "OWNER";
  if (!isCreator && !isOwner) throw forbidden("Only the schedule creator or the owner can cancel it");
  if (row.status !== "scheduled") throw notCancellable();

  if (!(await cancelScheduled(scheduleId, auth.userId))) throw notCancellable();

  await logEvent({
    eventType: "SCHEDULE_CANCELLED",
    homeId: row.home_id,
    deviceId: row.device_id,
    actorUserId: auth.userId,
    message: `${auth.displayName} huỷ hẹn giờ`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { schedule_id: scheduleId, action: row.action, run_at: row.run_at.toISOString() },
  });

  const updated = await getScheduleRow(scheduleId);
  if (!updated) throw scheduleNotFound();
  return toScheduleDto(updated, auth.userId, isOwner);
}
