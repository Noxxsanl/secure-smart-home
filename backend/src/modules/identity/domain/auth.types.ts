// Kiểu dữ liệu xác thực (CONTRACT_V2 §2). `req.auth` được gán bởi 3 middleware
// requireDashboard / requirePortalUser / requireMobileUser (guards/auth.guards.ts); handler đọc bằng
// getAuth(req) (core/auth/auth-context.ts) thay vì `(req as any)`.
import type { PortalName } from "../../../core/auth/auth-context";
import type { SystemRole } from "../../../shared/types/domain";

/** Người dùng trả về ở mọi endpoint login/register/me (CONTRACT §2.1). */
export interface MeUser {
  id: number;
  role: SystemRole;
  username: string;
  email: string | null;
  display_name: string;
  customer_id: number | null;
  user_tag: string | null;
}

/** Phản hồi login/register/refresh của kênh Mobile (CONTRACT §2.4). */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  /** Giây — 900 (15 phút). */
  expires_in: number;
  /** Giây — 2592000 (30 ngày). */
  refresh_expires_in: number;
  user: MeUser;
}

/** Row người dùng đã nạp lại ở mỗi request (không có password_hash). */
export interface AuthUserRow {
  id: number;
  username: string | null;
  email: string | null;
  /** COALESCE(customers.full_name, users.full_name). */
  full_name: string | null;
  role: SystemRole;
  status: "active" | "locked";
  customer_id: number | null;
  user_tag: string | null;
  /** users.token_version — token mang `tv` phải khớp, tăng khi đổi mật khẩu/khoá/đăng xuất. */
  token_version: number;
}

/** Row dùng khi đăng nhập (có băm mật khẩu — không bao giờ ra khỏi module identity). */
export interface LoginUserRow extends AuthUserRow {
  password_hash: string;
}

/** Phiên cookie (Dashboard/Portal) vừa cấp: controller đặt `token` vào cookie `sh_<portal>`. */
export interface SessionResult {
  user: MeUser;
  /** JWT đặt vào cookie `sh_<portal>`. */
  token: string;
  portal: PortalName;
  ttlSeconds: number;
}
