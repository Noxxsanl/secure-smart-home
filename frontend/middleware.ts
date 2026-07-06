import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_ROUTES } from "@/features/auth/routes";

const PUBLIC_PATHS: string[] = [AUTH_ROUTES.login];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Cookie token là HttpOnly nên JavaScript không đọc được giá trị.
  // Edge middleware vẫn kiểm tra được sự tồn tại (không phải giá trị) để
  // quyết định redirect mà không cần gọi round-trip tới backend.
  const isLoggedIn = Boolean(request.cookies.get("token")?.value);

  // Trang gốc redirect theo trạng thái đăng nhập
  if (pathname === "/") {
    const destination = isLoggedIn ? AUTH_ROUTES.dashboard : AUTH_ROUTES.login;
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // Ngăn người dùng đã đăng nhập truy cập trang login
  if (PUBLIC_PATHS.includes(pathname) && isLoggedIn) {
    return NextResponse.redirect(new URL(AUTH_ROUTES.dashboard, request.url));
  }

  // Bảo vệ tất cả các route private
  if (!PUBLIC_PATHS.includes(pathname) && !isLoggedIn) {
    return NextResponse.redirect(new URL(AUTH_ROUTES.login, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Bỏ qua các file nội bộ Next.js và asset tĩnh, chỉ xử lý các route thực sự
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
