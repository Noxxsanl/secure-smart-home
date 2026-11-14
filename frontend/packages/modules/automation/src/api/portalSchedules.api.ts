"use client";

import { api } from "@shh/api-client";
import { PORTAL_API, useApi } from "@shh/api-client/portal";
import type { Schedule, ScheduleInput, ScheduleList, ScheduleScope } from "@shh/api-client/portal";

// Hẹn giờ một lần (backend: module schedules). Cả hai tab dùng chung một khoá/limit cố định để trang Hẹn giờ và
// mục "Hẹn giờ" ở chi tiết thiết bị chia sẻ cache; tiền tố `schedulesPrefix` làm mới cả hai khi tạo/huỷ.
export const schedulesPrefix = (homeId: number) => `${PORTAL_API}/homes/${homeId}/schedules`;
export const schedulesKey = (homeId: number, scope: ScheduleScope) =>
  `${schedulesPrefix(homeId)}?scope=${scope}&limit=${scope === "upcoming" ? 100 : 50}`;
const schedulePrefix = `${PORTAL_API}/schedules`;

// Lịch sắp chạy đổi nhanh (đến giờ là chạy) nên poll 10 s; lịch sử 30 s.
const REFRESH_MS: Record<ScheduleScope, number> = { upcoming: 10_000, history: 30_000 };

/** GET /homes/:id/schedules?scope= — GUEST chỉ thấy lịch do chính mình tạo. */
export function useSchedules(homeId: number | null, scope: ScheduleScope) {
  return useApi<ScheduleList>(homeId === null ? null : schedulesKey(homeId, scope), {
    refreshInterval: REFRESH_MS[scope],
    revalidateOnFocus: true,
  });
}

/** POST /homes/:id/schedules — 201 trả lịch vừa tạo. */
export function createSchedule(homeId: number, input: ScheduleInput) {
  return api<Schedule>(schedulesPrefix(homeId), { method: "POST", body: input });
}

/** POST /schedules/:id/cancel — chỉ khi `status = scheduled`; người tạo hoặc chủ nhà. */
export function cancelSchedule(scheduleId: number) {
  return api<Schedule>(`${schedulePrefix}/${scheduleId}/cancel`, { method: "POST" });
}
