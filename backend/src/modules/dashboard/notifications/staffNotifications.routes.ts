import { Router } from "express";
import { listHandler, readAllHandler, readOneHandler } from "./staffNotifications.controller";

export function createStaffNotificationsRouter(): Router {
  const router = Router();
  router.get("/", listHandler);
  // /read-all phải khai báo trước /:id/read cho rõ ý (hai mẫu không trùng nhau nhưng dễ nhầm)
  router.patch("/read-all", readAllHandler);
  router.patch("/:id/read", readOneHandler);
  return router;
}
