// Composition root: danh sách module và cách gắn chúng vào các KÊNH API (thay cho AppModule của NestJS).
// Không chứa logic nghiệp vụ. Module chỉ được import qua index.ts của nó.
//
// Bản đồ route (tất cả dưới /api). Mỗi kênh có cách xác thực riêng:
//   /health                     – liveness (không auth)
//   /auth, /devices, /audit-log, /users, /notifications
//                               – legacy Prototype (cookie `token`) — tests/security/attack_demo*.sh còn dùng
//   /device/**                  – firmware (HMAC, không phiên): /device/data, /device/sensors
//   /dashboard/auth/**          – login, logout, me của ADMIN/OPERATOR (KHÔNG cần phiên, trừ /me)
//   /dashboard/**               – sau requireDashboard("admin", "operator") (cookie sh_admin | sh_operator + X-Portal)
//   /portal/auth/**, /portal/** – khách hàng web (cookie sh_user + X-Portal: user), cùng handler với /mobile
//   /mobile/auth/**, /mobile/** – app khách hàng (Bearer + refresh token); /mobile/ws là WebSocket (module realtime)
// Router /auth LUÔN mount trước guard của cùng kênh, nếu không login sẽ bị chặn 401.
import { Router } from "express";
import healthRoutes from "./core/health/health.routes";
import { auditModule } from "./modules/audit";
import { automationModule } from "./modules/automation";
import { controlModule } from "./modules/control";
import { devicesModule } from "./modules/devices";
import { homesModule } from "./modules/homes";
import {
  createDashboardAuthRouter,
  createMobileAuthRouter,
  createPortalAuthRouter,
  identityModule,
  requireDashboard,
  requireMobileUser,
  requirePortalUser,
} from "./modules/identity";
import { legacyModule } from "./modules/legacy";
import { notificationsModule } from "./modules/notifications";
import { otaModule } from "./modules/ota";
import { recommendationsModule } from "./modules/recommendations";
import { simulatorModule } from "./modules/simulator";
import { statsModule } from "./modules/stats";
import { telemetryModule } from "./modules/telemetry";
import type { AppModule, ModuleWorker } from "./shared/module";
import type { CustomerChannel } from "./shared/types/domain";

/** Thứ tự = thứ tự gắn route và khởi động worker. Module realtime gắn vào HTTP server riêng (main.ts). */
export const APP_MODULES: readonly AppModule[] = [
  legacyModule,
  identityModule,
  homesModule,
  devicesModule,
  telemetryModule,
  controlModule,
  automationModule,
  recommendationsModule,
  notificationsModule,
  otaModule,
  auditModule,
  statsModule,
  simulatorModule,
];

function buildCustomerRouter(channel: CustomerChannel): Router {
  const router = Router();
  for (const mod of APP_MODULES) mod.customer?.(router, channel);
  return router;
}

export function buildApiRouter(): Router {
  const api = Router();
  api.use("/health", healthRoutes);
  for (const mod of APP_MODULES) mod.api?.(api);

  const device = Router();
  for (const mod of APP_MODULES) mod.device?.(device);
  api.use("/device", device);

  const dashboard = Router();
  dashboard.use("/auth", createDashboardAuthRouter());
  dashboard.use(requireDashboard("admin", "operator"));
  for (const mod of APP_MODULES) mod.dashboard?.(dashboard);
  api.use("/dashboard", dashboard);

  api.use("/portal/auth", createPortalAuthRouter());
  api.use("/portal", requirePortalUser, buildCustomerRouter("web"));

  api.use("/mobile/auth", createMobileAuthRouter());
  api.use("/mobile", requireMobileUser, buildCustomerRouter("mobile"));
  return api;
}

export function listWorkers(): ModuleWorker[] {
  return APP_MODULES.flatMap((mod) => mod.workers ?? []);
}
