// Route của Prototype (cookie `token`), giữ nguyên cho tests/security/attack_demo*.sh. Không phát triển thêm;
// ngoại lệ của quy tắc phụ thuộc và bảng dữ liệu — xem modules/README.md.
import type { AppModule } from "../../shared/module";
import auditLogRoutes from "./routes/audit-log.routes";
import authRoutes from "./routes/auth.routes";
import deviceRoutes from "./routes/devices.routes";
import notificationRoutes from "./routes/notifications.routes";
import userRoutes from "./routes/users.routes";

export const legacyModule: AppModule = {
  name: "legacy",
  api: (router) => {
    router.use("/auth", authRoutes);
    router.use("/devices", deviceRoutes);
    router.use("/audit-log", auditLogRoutes);
    router.use("/users", userRoutes);
    router.use("/notifications", notificationRoutes);
  },
};
