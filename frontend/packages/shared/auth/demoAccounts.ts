import type { UserRole } from "@smarthome/shared/auth/types";

// Tài khoản demo do backend seed khi chạy dev (CONTRACT §8, SEED_DEMO_DATA).
// Chỉ là gợi ý hiển thị trên trang đăng nhập — không có logic xác thực ở client.
export const DEMO_ACCOUNT_HINTS: Record<UserRole, string> = {
  admin: "admin / admin123",
  operator: "operator01 / operator123",
  user: "user01@smarthome.local / user123",
};
