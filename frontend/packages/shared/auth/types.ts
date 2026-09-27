export type UserRole = "admin" | "operator" | "user";

export type User = {
  id: number;
  username: string;
  role: UserRole;
  display_name: string;
  // Chỉ tài khoản khách hàng (role=user) mới gắn với một Customer; staff là null.
  customer_id: number | null;
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
