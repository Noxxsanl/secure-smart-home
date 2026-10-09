// Router API khách hàng — mount 2 lần với cùng handler (CONTRACT_V2 §4):
//   createCustomerRouter("mobile") → /api/mobile/**  (sau requireMobileUser, Bearer)
//   createCustomerRouter("web")    → /api/portal/**  (sau requirePortalUser, cookie sh_user)
// `channel` chuyển vào router con để ghi device_commands.channel / user_behavior_logs.source đúng kênh.
// Các route /auth/* KHÔNG nằm ở đây: routes/index.ts mount chúng trước, không cần phiên; router này
// đã nằm sau middleware xác thực nên chỉ dùng getAuth(req), không gắn lại auth.
import { Router } from "express";
import { createAutomationRouter } from "./automation/automation.routes";
import { createClaimRouter } from "./claim/claim.routes";
import { createDevicesRouter } from "./devices/devices.routes";
import { createHomesRouter } from "./homes/homes.routes";
import { createMembersRouter } from "./members/members.routes";
import { createNotificationsRouter } from "./notifications/notifications.routes";
import { createProfileRouter } from "./profile/profile.routes";
import { createSuggestionsRouter } from "./suggestions/suggestions.routes";
import type { CustomerChannel } from "./customer.types";

export type { CustomerChannel } from "./customer.types";

export function createCustomerRouter(channel: CustomerChannel): Router {
  const router = Router();
  router.use(createProfileRouter());
  router.use(createHomesRouter());
  router.use(createDevicesRouter(channel));
  router.use(createNotificationsRouter());
  router.use(createMembersRouter());
  router.use(createAutomationRouter());
  router.use(createSuggestionsRouter());
  router.use(createClaimRouter());
  return router;
}
