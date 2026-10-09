import { NextResponse, type NextRequest } from "next/server";
import { REAUTH_PARAM, SESSION_COOKIES } from "@smarthome/shared/auth/session";
import type { PortalConfig } from "@smarthome/shared/auth/types";

// ---------------------------------------------------------------------------
// Proxy (Next 16, thay middleware) dùng chung cho 3 app. Đây chỉ là cổng UX:
// nhìn sự có mặt của cookie phiên để chuyển hướng sớm, KHÔNG xác thực. Backend
// kiểm tra JWT ở mọi request `/api/**`; cookie giả hoặc hết hạn vẫn nhận 401
// và AuthProvider phía client đưa người dùng về trang đăng nhập.
//
// Mỗi app gọi `createSessionProxy` trong `src/proxy.ts` và tự khai báo
// `config.matcher` (Next yêu cầu matcher là hằng số tĩnh trong file đó).
// ---------------------------------------------------------------------------

type SessionProxyOptions = {
  /** Trang chỉ dành cho người chưa đăng nhập (ngoài trang login), VD "/register". */
  guestOnlyPaths?: string[];
  /** Trang ai cũng vào được, proxy không chuyển hướng, VD "/forgot-password". */
  publicPaths?: string[];
};

export function createSessionProxy(portal: PortalConfig, options: SessionProxyOptions = {}) {
  const cookieName = SESSION_COOKIES[portal.role];
  const guestOnly = new Set([portal.loginPath, ...(options.guestOnlyPaths ?? [])]);
  const publicPaths = new Set(options.publicPaths ?? []);

  function redirectTo(request: NextRequest, pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return function sessionProxy(request: NextRequest): NextResponse {
    const { pathname, searchParams } = request.nextUrl;
    const hasSession = Boolean(request.cookies.get(cookieName)?.value);

    if (guestOnly.has(pathname)) {
      // Có `?reauth=` nghĩa là client đã biết phiên hết hiệu lực → để trang login hiện ra.
      if (hasSession && !searchParams.has(REAUTH_PARAM)) return redirectTo(request, portal.homePath);
      return NextResponse.next();
    }

    if (publicPaths.has(pathname)) return NextResponse.next();

    if (!hasSession) return redirectTo(request, portal.loginPath);
    return NextResponse.next();
  };
}
