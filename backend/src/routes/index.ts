import { Router } from "express";
import authRoutes from "./auth";
import auditRoutes from "./audit";
import dashboardRoutes from "./dashboard";
import dataRoutes from "./data.routes";
import deviceRoutes from "./devices";
import healthRoutes from "./health.routes";
import notificationRoutes from "./notifications";
import sensorsRoutes from "./sensors.routes";
import userRoutes from "./users";

const router = Router();

// Bản đồ route (tất cả mount dưới /api):
//   /health           – kiểm tra liveness (không cần auth)
//   /auth             – đăng nhập, đăng xuất, /me
//   /devices          – CRUD + quản lý trạng thái (yêu cầu JWT)
//   /device/data      – firmware đẩy dữ liệu qua HTTP (xác thực HMAC, không cần JWT)
//   /device/sensors   – gateway lấy danh sách sensor (xác thực HMAC, không cần JWT)
//   /dashboard        – thống kê tổng hợp (yêu cầu JWT)
//   /audit-log        – nhật ký bảo mật (JWT + lọc theo role)
//   /users            – quản lý người dùng (chỉ admin)
//   /notifications    – thông báo trong ứng dụng (chỉ admin)
router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/devices", deviceRoutes);
router.use("/device/data", dataRoutes);
router.use("/device/sensors", sensorsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/audit-log", auditRoutes);
router.use("/users", userRoutes);
router.use("/notifications", notificationRoutes);

export default router;
