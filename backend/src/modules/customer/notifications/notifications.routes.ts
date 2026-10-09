// /notifications (FR-8.2, 8.4). Controller + service mỏng gộp trong route: không có nghiệp vụ ngoài lọc theo chủ sở hữu.
import { Router } from "express";
import { notFound } from "../../../lib/http";
import { optionalId, parseIdParam, parseLimit, queryString } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { toCustomerNotification } from "../../notifications/notification.service";
import { countUnread, listForUser, markAllRead, markRead } from "./notifications.repository";

export function createNotificationsRouter(): Router {
  const router = Router();

  router.get("/notifications", async (req, res) => {
    const auth = getAuth(req);
    const homeId = optionalId(queryString(req.query.home_id, 12), "home_id");
    const limit = parseLimit(req.query.limit, 50, 200);
    const [rows, unread] = await Promise.all([listForUser(auth.userId, homeId, limit), countUnread(auth.userId, homeId)]);
    res.json({ notifications: rows.map(toCustomerNotification), unread_count: unread });
  });

  // Khai báo trước /:id/read — khác số đoạn đường dẫn nên không đụng nhau, đặt trước cho rõ ràng
  router.patch("/notifications/read-all", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    await markAllRead(getAuth(req).userId, optionalId(body.home_id, "home_id"));
    res.status(204).end();
  });

  router.patch("/notifications/:id/read", async (req, res) => {
    const found = await markRead(getAuth(req).userId, parseIdParam(req.params.id));
    if (!found) throw notFound("Notification not found");
    res.status(204).end();
  });

  return router;
}
