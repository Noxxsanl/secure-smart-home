// Cửa ra DUY NHẤT của module identity: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
// Danh sách tường minh — thêm export mới ở identity.facade.ts rồi liệt kê ở đây.
export { identityModule } from "./identity.module";
// Cho composition root (app.module.ts): router /auth của 3 kênh (mount trước guard của kênh) + guard của kênh.
export { createDashboardAuthRouter, createMobileAuthRouter, createPortalAuthRouter } from "./identity.module";
export {
  authenticateAccessToken,
  findActiveCustomerById,
  findAuthUserById,
  findCustomerByTag,
  getCustomerByUserId,
  listRecentActivations,
  requireDashboard,
  requireMobileUser,
  requirePortalUser,
  revokeAllRefreshTokens,
} from "./identity.facade";
export type { Customer } from "./domain/console-identity.types";
