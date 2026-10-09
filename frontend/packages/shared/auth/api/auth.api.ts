import { api } from "@smarthome/shared/api/http";
import type { RegisterInput, User, UserRole } from "@smarthome/shared/auth/types";

// ---------------------------------------------------------------------------
// Auth thật theo kênh (CONTRACT §2):
//   admin / operator → /api/dashboard/auth/*  body { username, password, portal }
//   user (khách)     → /api/portal/auth/*     body { email, password }
// Backend set cookie HttpOnly `sh_<role>`; JS không bao giờ thấy token.
// Mọi lời gọi ở đây dùng `skipAuthRedirect`: 401 của login/me là kết quả bình
// thường, không phải "phiên hết hạn giữa chừng".
// ---------------------------------------------------------------------------

type MeResponse = { user: RawUser };

// Phòng khi backend bỏ trống vài trường tuỳ chọn — UI luôn nhận đủ kiểu User.
type RawUser = Partial<User> & { id: number; role: UserRole };

function authBase(role: UserRole): string {
  return role === "user" ? "/api/portal/auth" : "/api/dashboard/auth";
}

export function normalizeUser(raw: RawUser): User {
  const username = raw.username ?? raw.email ?? "";
  return {
    id: raw.id,
    role: raw.role,
    username,
    email: raw.email ?? null,
    display_name: raw.display_name || username,
    customer_id: raw.customer_id ?? null,
    user_tag: raw.user_tag ?? null,
  };
}

/**
 * Đăng nhập vào cổng `portalRole`. `identifier` là tên đăng nhập (staff) hoặc
 * email / mã người dùng (khách hàng).
 */
export async function login(portalRole: UserRole, identifier: string, password: string): Promise<User> {
  const body =
    portalRole === "user"
      ? { email: identifier, password }
      : { username: identifier, password, portal: portalRole };
  const res = await api<MeResponse>(`${authBase(portalRole)}/login`, {
    method: "POST",
    body,
    skipAuthRedirect: true,
  });
  return normalizeUser(res.user);
}

/** Đăng ký tài khoản khách hàng — chỉ có trên cổng khách hàng. Thành công thì đã có phiên. */
export async function register(input: RegisterInput): Promise<User> {
  const res = await api<MeResponse>("/api/portal/auth/register", {
    method: "POST",
    body: {
      full_name: input.full_name,
      email: input.email,
      password: input.password,
      ...(input.phone ? { phone: input.phone } : {}),
    },
    skipAuthRedirect: true,
  });
  return normalizeUser(res.user);
}

/** Thu hồi phiên phía server (backend xoá cookie HttpOnly). */
export async function logout(portalRole: UserRole): Promise<void> {
  await api<void>(`${authBase(portalRole)}/logout`, { method: "POST", skipAuthRedirect: true });
}

/** Phiên hiện tại của cổng. Ném FetchError (401 khi chưa đăng nhập / phiên vô hiệu). */
export async function getUser(portalRole: UserRole): Promise<User> {
  const res = await api<MeResponse>(`${authBase(portalRole)}/me`, { skipAuthRedirect: true });
  return normalizeUser(res.user);
}
