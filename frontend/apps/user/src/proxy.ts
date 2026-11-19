import { createSessionProxy } from "@shh/auth/proxy";
import { PORTAL } from "@/config/portal";

// Cổng khách hàng: chưa có cookie `sh_user` thì vào trang riêng tư sẽ bị đưa về
// /login; đã có cookie mà vào /login hoặc /register thì về /home. Đây chỉ là
// cổng UX — backend mới xác thực JWT ở mọi request /api/**.
export const proxy = createSessionProxy(PORTAL, {
  guestOnlyPaths: ["/register"],
  publicPaths: ["/forgot-password"],
});

export const config = {
  // Bỏ qua /api (rewrite sang backend), /_next và file tĩnh (có dấu chấm, VD /img-01.webp).
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
