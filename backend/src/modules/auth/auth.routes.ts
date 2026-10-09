// Router xác thực của 3 kênh (CONTRACT_V2 §2). Mỗi router mount NGAY dưới tiền tố kênh và phải được
// mount TRƯỚC middleware bảo vệ của kênh đó (routes/index.ts) — login/register/refresh/logout không có phiên.
//   /api/dashboard/auth/{login,logout,me}
//   /api/portal/auth/{register,login,logout,me}
//   /api/mobile/auth/{register,login,refresh,logout,me}
import { Router } from "express";
import {
  dashboardLogin,
  dashboardLogout,
  me,
  mobileLogin,
  mobileLogout,
  mobileRefresh,
  mobileRegister,
  portalLogin,
  portalLogout,
  portalRegister,
} from "./auth.controller";
import { csrfGuard, requireDashboard, requireMobileUser, requirePortalUser } from "./auth.middleware";

export function createDashboardAuthRouter(): Router {
  const router = Router();
  // POST login/logout chưa có phiên → kiểm X-Portal ở cấp router (requireDashboard tự kiểm cho route có phiên)
  router.use(csrfGuard(["admin", "operator"]));
  router.post("/login", dashboardLogin);
  router.post("/logout", dashboardLogout);
  router.get("/me", requireDashboard(), me);
  return router;
}

export function createPortalAuthRouter(): Router {
  const router = Router();
  router.use(csrfGuard(["user"]));
  router.post("/register", portalRegister);
  router.post("/login", portalLogin);
  router.post("/logout", portalLogout);
  router.get("/me", requirePortalUser, me);
  return router;
}

export function createMobileAuthRouter(): Router {
  const router = Router();
  // Bearer không tự gửi theo trình duyệt nên kênh này không cần X-Portal/CSRF
  router.post("/register", mobileRegister);
  router.post("/login", mobileLogin);
  router.post("/refresh", mobileRefresh);
  router.post("/logout", mobileLogout);
  router.get("/me", requireMobileUser, me);
  return router;
}
