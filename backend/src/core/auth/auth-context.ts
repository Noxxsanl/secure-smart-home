// Ngữ cảnh xác thực của request (CONTRACT_V2 §2) — dùng chung mọi module, không phụ thuộc DB.
// `req.auth` được gán bởi guard của module identity (requireDashboard / requirePortalUser / requireMobileUser);
// handler đọc bằng getAuth(req) thay vì `(req as any)`.
import type { Request } from "express";
import { HttpError } from "../../shared/errors/http-error";
import type { SystemRole } from "../../shared/types/domain";

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

/** Trả AuthContext của request; chưa xác thực (lỗi lắp middleware) → 401 NO_TOKEN. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw new HttpError(401, "NO_TOKEN", "Authentication required");
  return req.auth;
}
