export type UserRole = "admin" | "operator" | "user";

// MeUser (CONTRACT §2.1) — backend trả về ở mọi endpoint login / me / register.
export type User = {
  id: number;
  role: UserRole;
  // Staff: tên đăng nhập. Khách hàng: backend trả email vào trường này.
  username: string;
  email: string | null;
  // full_name ?? username
  display_name: string;
  // Chỉ tài khoản khách hàng (role=user) mới gắn với một Customer; staff là null.
  customer_id: number | null;
  // Mã người dùng của khách (VD "dat#4821") — dùng khi nhờ hỗ trợ gán nhà; staff là null.
  user_tag: string | null;
};

// Đăng ký tài khoản khách hàng trên cổng web (CONTRACT §2.3).
export type RegisterInput = {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
};

// Mỗi app (admin / operator / user) phục vụ đúng 1 role hệ thống. App truyền
// cấu hình này vào AuthProvider; guard, login và khung giao diện dùng chung đọc
// lại qua useAuth().portal thay vì hard-code route hay role.
export type PortalConfig = {
  role: UserRole;
  name: string;
  homePath: string;
  loginPath: string;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Quản trị viên",
  operator: "Vận hành",
  user: "Khách hàng",
};

export const PORTAL_LABELS: Record<UserRole, string> = {
  admin: "cổng Quản trị (Admin)",
  operator: "cổng Vận hành (Operator)",
  user: "cổng Khách hàng",
};
