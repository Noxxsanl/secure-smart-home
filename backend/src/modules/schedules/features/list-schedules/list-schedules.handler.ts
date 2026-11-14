// Danh sách hẹn giờ của nhà (hợp đồng §2.2). Quyền xem = thành viên hiệu lực ("view"); không phải thành viên → 404.
// GUEST chỉ thấy lịch do chính mình tạo; vai trò khác thấy mọi lịch của nhà. (Cố ý KHÔNG dùng view_automation như
// danh sách rule: quyền đó loại GUEST, trong khi GUEST được hẹn giờ thiết bị mình được phép.)
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireHomeMember } from "../../../homes";
import { toScheduleDto } from "../../domain/schedule-policy";
import type { Schedule, ScheduleScope } from "../../domain/schedule.types";
import { listScheduleRows } from "../../infrastructure/schedule.read-model";

export async function listSchedules(auth: AuthContext, homeId: number, scope: ScheduleScope, limit: number): Promise<Schedule[]> {
  const access = await requireHomeMember(auth, homeId, "view");
  const rows = await listScheduleRows(homeId, scope, limit, access.role === "GUEST" ? auth.userId : null);
  const isOwner = access.role === "OWNER";
  return rows.map((row) => toScheduleDto(row, auth.userId, isOwner));
}
