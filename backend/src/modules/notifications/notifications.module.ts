// Module notifications: thông báo khách (theo user) và nhân viên (theo role). Sở hữu notifications.
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import { listNotificationsController } from "./features/list-notifications/list-notifications.controller";
import { listStaffNotificationsController } from "./features/list-staff-notifications/list-staff-notifications.controller";
import {
  markAllNotificationsReadController,
  markNotificationReadController,
} from "./features/mark-notifications-read/mark-notifications-read.controller";
import {
  markAllStaffNotificationsReadController,
  markStaffNotificationReadController,
} from "./features/mark-staff-notifications-read/mark-staff-notifications-read.controller";

export const notificationsModule: AppModule = {
  name: "notifications",
  dashboard: (router) => {
    // /notifications của nhân viên (FR-8.5)
    const staff = Router();
    staff.get("/", listStaffNotificationsController);
    // /read-all phải khai báo trước /:id/read cho rõ ý (hai mẫu không trùng nhau nhưng dễ nhầm)
    staff.patch("/read-all", markAllStaffNotificationsReadController);
    staff.patch("/:id/read", markStaffNotificationReadController);
    router.use("/notifications", staff);
  },
  customer: (router) => {
    // /notifications của khách, dùng chung portal + mobile (FR-8.2, 8.4)
    router.get("/notifications", listNotificationsController);
    // Khai báo trước /:id/read — khác số đoạn đường dẫn nên không đụng nhau, đặt trước cho rõ ràng
    router.patch("/notifications/read-all", markAllNotificationsReadController);
    router.patch("/notifications/:id/read", markNotificationReadController);
  },
};
