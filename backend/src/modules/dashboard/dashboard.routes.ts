// Router API console — mount dưới /api/dashboard SAU requireDashboard("admin", "operator")
// (routes/index.ts). Router con /ai và /simulator mount riêng ở routes/index.ts; /auth cũng vậy.
//
// Mỗi domain: <domain>/<domain>.{routes,controller,service,repository}.ts. Phân quyền tầng 2 của Operator
// (FR-9.6) nằm ở service (requireOperatorHomeAccess / resolveOperatorAccess / loadStaffScope); route chỉ ADMIN
// kiểm bằng requireAdmin(auth) trong service. Lỗi ném HttpError → error middleware ở app.ts.
import { Router } from "express";
import { createAutomationRouter } from "./automation/automation.routes";
import { createCustomersRouter } from "./customers/customers.routes";
import { createDevicesRouter } from "./devices/devices.routes";
import { createFirmwareRouter, createOtaRouter } from "./firmware/firmware.routes";
import { createGatewaysRouter } from "./gateways/gateways.routes";
import { createLogsRouter } from "./logs/logs.routes";
import { createStaffNotificationsRouter } from "./notifications/staffNotifications.routes";
import { createOperatorAccessRouter } from "./operator-access/operatorAccess.routes";
import { createSmartHomesRouter } from "./smart-homes/smartHomes.routes";
import { createStatsRouter } from "./stats/stats.routes";
import { createTeamRouter } from "./team/team.routes";

export function createDashboardRouter(): Router {
  const router = Router();
  router.use("/smart-homes", createSmartHomesRouter());
  router.use("/customers", createCustomersRouter());
  router.use("/gateways", createGatewaysRouter());
  router.use("/devices", createDevicesRouter());
  router.use("/automation", createAutomationRouter());
  router.use("/firmware", createFirmwareRouter());
  router.use("/ota", createOtaRouter());
  router.use("/notifications", createStaffNotificationsRouter());
  router.use("/logs", createLogsRouter());
  router.use("/stats", createStatsRouter());
  router.use("/team", createTeamRouter());
  router.use("/operator-access", createOperatorAccessRouter());
  return router;
}
