"use client";

import { useRevalidate } from "@shh/api-client/portal";
import type { Schedule, ScheduleInput } from "@shh/api-client/portal";
import { cancelSchedule, createSchedule, schedulesPrefix } from "./portalSchedules.api";

/**
 * Tạo / huỷ hẹn giờ của một nhà rồi làm mới mọi truy vấn lịch của nhà đó (tab "Sắp chạy", "Đã chạy", mục Hẹn giờ ở
 * chi tiết thiết bị). Lỗi được ném tiếp để UI đổi sang câu tiếng Việt.
 */
export function useScheduleActions(homeId: number) {
  const revalidate = useRevalidate();

  return {
    async create(input: ScheduleInput): Promise<Schedule> {
      const created = await createSchedule(homeId, input);
      await revalidate(schedulesPrefix(homeId));
      return created;
    },
    async cancel(scheduleId: number): Promise<Schedule> {
      const cancelled = await cancelSchedule(scheduleId);
      await revalidate(schedulesPrefix(homeId));
      return cancelled;
    },
    /** 404/409 nghĩa là danh sách đã cũ (lịch vừa chạy, vừa bị huỷ) — tải lại cho khớp. */
    refresh: () => revalidate(schedulesPrefix(homeId)),
  };
}
