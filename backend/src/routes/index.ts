import { Router } from "express";
import { createAiRouter } from "../modules/ai/ai.routes";
import { requireDashboard, requireMobileUser, requirePortalUser } from "../modules/auth/auth.middleware";
import { createDashboardAuthRouter, createMobileAuthRouter, createPortalAuthRouter } from "../modules/auth/auth.routes";
import { createCustomerRouter } from "../modules/customer/customer.routes";
import { createDashboardRouter } from "../modules/dashboard/dashboard.routes";
import { createSimulatorRouter } from "../modules/simulator/simulator.routes";
import authRoutes from "./auth";
import auditRoutes from "./audit";
import dataRoutes from "./data.routes";
import deviceRoutes from "./devices";
import healthRoutes from "./health.routes";
import notificationRoutes from "./notifications";
import sensorsRoutes from "./sensors.routes";
import userRoutes from "./users";

const router = Router();

// Bản đồ route (tất cả mount dưới /api). API tách theo KÊNH; mỗi kênh có cách xác thực riêng.
//
// Chung / legacy (giữ nguyên — scripts/attack_demo*.sh còn dùng; cookie `token`):
//   /health               – kiểm tra liveness (không cần auth)
//   /auth                 – đăng nhập, đăng xuất, /me (legacy)
//   /devices              – CRUD + quản lý trạng thái (legacy, JWT)
//   /device/data          – firmware đẩy dữ liệu qua HTTP (xác thực HMAC, không cần JWT)
//   /device/sensors       – gateway lấy danh sách sensor (xác thực HMAC, không cần JWT)
//   /audit-log            – nhật ký bảo mật (legacy, JWT + lọc theo role)
//   /users                – quản lý người dùng (legacy, chỉ admin)
//   /notifications        – thông báo (legacy, chỉ admin)
//
// V2 – Dashboard (ADMIN/OPERATOR, cookie sh_admin | sh_operator + header X-Portal):
//   /dashboard/auth/**         – login, logout, me (KHÔNG cần phiên, trừ /me)
//   /dashboard/ai/**           – gợi ý thói quen (BE-D)
//   /dashboard/simulator/**    – điều khiển thiết bị ảo (BE-D)
//   /dashboard/**              – smart-homes, customers, gateways, devices, OTA, logs, stats… (BE-C)
// V2 – Portal web khách hàng (USER, cookie sh_user + header X-Portal: user):
//   /portal/auth/**            – register, login, logout, me (KHÔNG cần phiên, trừ /me)
//   /portal/**                 – API khách hàng (BE-B), cùng handler với /mobile
// V2 – Mobile (USER, Authorization: Bearer <access JWT> + refresh token xoay vòng):
//   /mobile/auth/**            – register, login, refresh, logout (KHÔNG cần phiên), me
//   /mobile/**                 – API khách hàng (BE-B); /mobile/ws là WebSocket (wsHub, BE-D)
// Router xác thực LUÔN mount trước router được bảo vệ cùng kênh, nếu không login sẽ bị chặn 401.
router.use("/health", healthRoutes);

router.use("/auth", authRoutes);
router.use("/devices", deviceRoutes);
router.use("/device/data", dataRoutes);
router.use("/device/sensors", sensorsRoutes);
router.use("/audit-log", auditRoutes);
router.use("/users", userRoutes);
router.use("/notifications", notificationRoutes);

const dashboardRouter = Router();
dashboardRouter.use("/auth", createDashboardAuthRouter());
dashboardRouter.use(requireDashboard("admin", "operator"));
dashboardRouter.use("/ai", createAiRouter());
dashboardRouter.use("/simulator", createSimulatorRouter());
dashboardRouter.use(createDashboardRouter());
router.use("/dashboard", dashboardRouter);

router.use("/portal/auth", createPortalAuthRouter());
router.use("/portal", requirePortalUser, createCustomerRouter("web"));

router.use("/mobile/auth", createMobileAuthRouter());
router.use("/mobile", requireMobileUser, createCustomerRouter("mobile"));

export default router;
