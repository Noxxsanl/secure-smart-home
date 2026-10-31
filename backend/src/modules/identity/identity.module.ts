// Module identity: tài khoản (users, customers, refresh_tokens), đăng nhập 3 kênh, hồ sơ khách, nhân viên.
//
// Router /auth của 3 kênh (createDashboardAuthRouter / createPortalAuthRouter / createMobileAuthRouter) KHÔNG nằm trong
// `identityModule`: app.module.ts mount chúng NGAY dưới tiền tố kênh và TRƯỚC guard của kênh (chưa có phiên) — nếu mount
// sau guard thì login bị chặn 401. Mỗi router có csrfGuard riêng ở cấp router con nên không ảnh hưởng route module khác.
//   /api/dashboard/auth/{login,logout,me}
//   /api/portal/auth/{register,login,logout,me}
//   /api/mobile/auth/{register,login,refresh,logout,me}
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import { changePasswordController } from "./features/change-password/change-password.controller";
import { createStaffController } from "./features/create-staff/create-staff.controller";
import { deleteStaffController } from "./features/delete-staff/delete-staff.controller";
import { getCustomerDetailController } from "./features/get-customer-detail/get-customer-detail.controller";
import { getMeController } from "./features/get-me/get-me.controller";
import { getProfileController } from "./features/get-profile/get-profile.controller";
import { listStaffController } from "./features/list-staff/list-staff.controller";
import {
  dashboardLoginController,
  mobileLoginController,
  portalLoginController,
} from "./features/login/login.controller";
import {
  dashboardLogoutController,
  mobileLogoutController,
  portalLogoutController,
} from "./features/logout/logout.controller";
import { startRefreshTokenRetentionJob } from "./features/purge-refresh-tokens/purge-refresh-tokens.job";
import { refreshSessionController } from "./features/refresh-session/refresh-session.controller";
import { mobileRegisterController, portalRegisterController } from "./features/register/register.controller";
import { searchCustomersController } from "./features/search-customers/search-customers.controller";
import { updateProfileController } from "./features/update-profile/update-profile.controller";
import { updateStaffController } from "./features/update-staff/update-staff.controller";
import { csrfGuard, requireDashboard, requireMobileUser, requirePortalUser } from "./guards/auth.guards";

export function createDashboardAuthRouter(): Router {
  const router = Router();
  // POST login/logout chưa có phiên → kiểm X-Portal ở cấp router (requireDashboard tự kiểm cho route có phiên)
  router.use(csrfGuard(["admin", "operator"]));
  router.post("/login", dashboardLoginController);
  router.post("/logout", dashboardLogoutController);
  router.get("/me", requireDashboard(), getMeController);
  return router;
}

export function createPortalAuthRouter(): Router {
  const router = Router();
  router.use(csrfGuard(["user"]));
  router.post("/register", portalRegisterController);
  router.post("/login", portalLoginController);
  router.post("/logout", portalLogoutController);
  router.get("/me", requirePortalUser, getMeController);
  return router;
}

export function createMobileAuthRouter(): Router {
  const router = Router();
  // Bearer không tự gửi theo trình duyệt nên kênh này không cần X-Portal/CSRF
  router.post("/register", mobileRegisterController);
  router.post("/login", mobileLoginController);
  router.post("/refresh", refreshSessionController);
  router.post("/logout", mobileLogoutController);
  router.get("/me", requireMobileUser, getMeController);
  return router;
}

export const identityModule: AppModule = {
  name: "identity",
  dashboard: (router) => {
    // Khách hàng trên console (FR-9.x)
    const customers = Router();
    customers.get("/", searchCustomersController);
    customers.get("/:id", getCustomerDetailController);
    router.use("/customers", customers);

    // Nhân viên (FR-11.4, chỉ ADMIN)
    const team = Router();
    team.get("/", listStaffController);
    team.post("/", createStaffController);
    team.patch("/:id", updateStaffController);
    team.delete("/:id", deleteStaffController);
    router.use("/team", team);
  },
  customer: (router) => {
    // Hồ sơ + đổi mật khẩu của khách, dùng chung portal + mobile
    router.get("/me/profile", getProfileController);
    router.patch("/me/profile", updateProfileController);
    router.post("/me/password", changePasswordController);
  },
  workers: [{ name: "refreshTokenRetention", start: startRefreshTokenRetentionJob }],
};
