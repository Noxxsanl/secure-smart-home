import { createSessionProxy } from "@shh/auth/proxy";
import { PORTAL } from "@/config/portal";

// Cổng Admin: chưa có cookie `sh_admin` thì vào trang riêng tư sẽ bị đưa về
// /login; đã có cookie mà vào /login thì về /dashboard. Đây chỉ là cổng UX —
// backend mới xác thực JWT ở mọi request /api/**.
export const proxy = createSessionProxy(PORTAL, {
  publicPaths: ["/forgot-password"],
});

export const config = {
  // Bỏ qua /api (rewrite sang backend), /_next và file tĩnh (có dấu chấm, VD /img-01.webp).
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
