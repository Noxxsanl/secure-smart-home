import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_ROUTES } from "@/features/auth/routes";

const PUBLIC_PATHS: string[] = [AUTH_ROUTES.login];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoggedIn = Boolean(request.cookies.get("token")?.value);

  if (pathname === "/") {
    const destination = isLoggedIn ? AUTH_ROUTES.dashboard : AUTH_ROUTES.login;
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(AUTH_ROUTES.dashboard, request.url));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL(AUTH_ROUTES.login, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
