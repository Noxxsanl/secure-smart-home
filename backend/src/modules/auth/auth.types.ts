// Kiểu dữ liệu xác thực (CONTRACT_V2 §2). `req.auth` được gán bởi 3 middleware
// requireDashboard / requirePortalUser / requireMobileUser (auth.middleware.ts); handler đọc bằng
// getAuth(req) (authContext.ts) thay vì `(req as any)`.
import type { SystemRole } from "../../types/domain";

/** Kênh xác thực của request: Dashboard (cookie nhân viên), Portal (cookie khách), Mobile (Bearer). */
export type AuthChannel = "dashboard" | "portal" | "mobile";

/** Tên portal trong header X-Portal và hậu tố cookie `sh_<portal>`. */
export type PortalName = "admin" | "operator" | "user";

export interface AuthContext {
  userId: number;
  role: SystemRole;
  /** customers.id — null với nhân viên. */
  customerId: number | null;
  /** username (nhân viên) hoặc email (khách) — khớp MeUser.username. */
  username: string;
  email: string | null;
  /** full_name ?? username — tên hiển thị. */
  displayName: string;
  channel: AuthChannel;
  /** customers.user_tag (vd "dat#4821") — null với nhân viên. */
  userTag: string | null;
}

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

/** Row dùng khi đăng nhập (có băm mật khẩu — không bao giờ ra khỏi module auth). */
export interface LoginUserRow extends AuthUserRow {
  password_hash: string;
}

// Bổ sung kiểu cho Express: `req.auth`. Khai báo ngay trong module .ts (không dùng .d.ts rời)
// để ts-node/ts-node-dev — vốn chỉ nạp file được import — vẫn thấy khai báo này.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Có sau requireDashboard / requirePortalUser / requireMobileUser. Đọc bằng getAuth(req). */
      auth?: AuthContext;
    }
  }
}
