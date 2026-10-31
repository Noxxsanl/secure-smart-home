// Hàm của module identity mà module khác được gọi (qua index.ts). Chỉ re-export — cài đặt nằm ở domain/,
// infrastructure/ và guards/.
export { authenticateAccessToken, revokeAllRefreshTokens } from "./domain/session.service";
export { requireDashboard, requireMobileUser, requirePortalUser } from "./guards/auth.guards";
export { findAuthUserById } from "./infrastructure/auth.repository";
export {
  findActiveCustomerById,
  findCustomerByTag,
  getCustomerByUserId,
  listRecentActivations,
} from "./infrastructure/customers.read-model";
