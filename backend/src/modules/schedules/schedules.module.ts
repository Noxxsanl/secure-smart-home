// Module schedules: hẹn giờ MỘT LẦN cho thiết bị (bật/tắt, đặt nhiệt độ điều hoà, mở rèm) + worker chạy lịch đến hạn.
// Sở hữu scheduled_actions. Khác module automation (luật lặp lại theo ngày/ngưỡng cảm biến).
//
// Bảng route (customer = /api/portal [channel web] + /api/mobile [channel mobile], cùng handler):
//   GET  /homes/:homeId/schedules?scope=upcoming|history&limit=   list-schedules
//   POST /homes/:homeId/schedules                                 create-schedule
//   POST /schedules/:scheduleId/cancel                            cancel-schedule
// Worker scheduleRunner (tick 5 s) thực thi qua sendDeviceCommand của module control.
import type { AppModule } from "../../shared/module";
import { cancelScheduleController } from "./features/cancel-schedule/cancel-schedule.controller";
import { createScheduleController } from "./features/create-schedule/create-schedule.controller";
import { listSchedulesController } from "./features/list-schedules/list-schedules.controller";
import { startScheduleRunner } from "./features/run-schedules/run-schedules.job";

export const schedulesModule: AppModule = {
  name: "schedules",
  customer: (router, channel) => {
    router.get("/homes/:homeId/schedules", listSchedulesController);
    router.post("/homes/:homeId/schedules", createScheduleController(channel));
    router.post("/schedules/:scheduleId/cancel", cancelScheduleController);
  },
  workers: [{ name: "scheduleRunner", start: startScheduleRunner }],
};
