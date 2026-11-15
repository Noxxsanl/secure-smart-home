// Lấy Schedule DTO theo id / theo yêu cầu của Trợ lý AI — module agent dùng qua facade để dựng response mà không đụng bảng
// scheduled_actions. `callerIsOwner` quyết định `can_cancel` như list-schedules.
import { listScheduleRowsByAgentRequest, listScheduleRowsByIds } from "../infrastructure/schedule.read-model";
import { toScheduleDto } from "./schedule-policy";
import type { Schedule } from "./schedule.types";

export async function getSchedulesByIds(ids: readonly number[], callerUserId: number, callerIsOwner: boolean): Promise<Schedule[]> {
  const rows = await listScheduleRowsByIds(ids);
  return rows.map((row) => toScheduleDto(row, callerUserId, callerIsOwner));
}

export async function listSchedulesByAgentRequest(agentRequestId: number, callerUserId: number, callerIsOwner: boolean): Promise<Schedule[]> {
  const rows = await listScheduleRowsByAgentRequest(agentRequestId);
  return rows.map((row) => toScheduleDto(row, callerUserId, callerIsOwner));
}
