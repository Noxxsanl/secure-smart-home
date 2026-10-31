// @shh/auth — định danh và role-gate. Là module duy nhất mà module khác được import (quy tắc R4):
// người dùng hiện tại, quyền console theo role hệ thống, nhà đang chọn + quyền theo role trong nhà.
// createSessionProxy ở cửa ra riêng "@shh/auth/proxy" (chạy trong Next proxy, không kéo React vào).

// Phiên đăng nhập + quyền console
export { AuthProvider } from "./api/AuthProvider";
export { useAuth, useCurrentUser } from "./api/useAuth";
export { usePermissions, useStaffRole, type StaffRole } from "./api/usePermissions";
export { PORTAL_LABELS, ROLE_LABELS, type PortalConfig, type User, type UserRole } from "./model/types";
export { EMAIL_PATTERN } from "./model/errors";

// Nhà đang chọn (cổng khách) + quyền theo role trong nhà
export { CurrentHomeProvider, useCurrentHome } from "./api/CurrentHomeProvider";
export { useCurrentOverview } from "./api/useCurrentOverview";
export { ASSIGNABLE_ROLES, MEMBER_ROLE_LABELS, ROLE_HINTS, permissionsFor, type HomePermissions } from "./model/homeRoles";

// Feature
export { LoginPage } from "./features/login";
export { RegisterPage } from "./features/register";
export { ForgotPasswordPage } from "./features/forgot-password";
export { AuthGuard, GuestGuard } from "./features/guards";
export { PortalSwrProvider } from "./features/portal-cache";
export { HomeGate } from "./features/home-gate";
export { HomeSwitcher } from "./features/home-switcher";
export { ProfilePage } from "./features/profile";
